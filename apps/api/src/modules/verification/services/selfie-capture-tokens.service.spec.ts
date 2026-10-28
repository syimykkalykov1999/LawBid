import { HttpException } from '@nestjs/common';
import type Redis from 'ioredis';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { selfieCaptureDto } from './verification-admin.service';
import { selfieCaptureMeta } from './verification-requests.service';
import {
  SELFIE_CAPTURE_TOKEN_TTL_SEC,
  SelfieCaptureTokensService,
} from './selfie-capture-tokens.service';

/** Minimal in-memory Redis: SET (EX, NX) and GETDEL. */
function fakeRedis() {
  const store = new Map<string, string>();
  const redis = {
    set: jest.fn((key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    getdel: jest.fn((key: string) => {
      const v = store.get(key) ?? null;
      store.delete(key);
      return Promise.resolve(v);
    }),
  };
  return { store, redis: redis as unknown as Redis };
}

async function reasonOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    const body = (e as HttpException).getResponse() as {
      code?: string;
      details?: { reason?: string };
    };
    expect((e as HttpException).getStatus()).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
    return body.details?.reason;
  }
  return undefined;
}

describe('SelfieCaptureTokensService (owner 2026-10-28)', () => {
  const T0 = Date.UTC(2026, 9, 28, 12, 0, 0);

  it('issues a random token valid 30 minutes; only its hash is stored', async () => {
    const { store, redis } = fakeRedis();
    const s = new SelfieCaptureTokensService(redis);
    const a = await s.issue('u1', 'r1', T0);
    const b = await s.issue('u1', 'r1', T0);
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(16);
    expect(a.token.length).toBeLessThanOrEqual(64);
    expect(Date.parse(a.expiresAt) - T0).toBe(
      SELFIE_CAPTURE_TOKEN_TTL_SEC * 1000,
    );
    for (const key of store.keys()) expect(key).not.toContain(a.token);
  });

  it('spends a valid token once; the second use is invalid', async () => {
    const { redis } = fakeRedis();
    const s = new SelfieCaptureTokensService(redis);
    const { token } = await s.issue('u1', 'r1', T0);
    const grant = await s.consume('u1', 'r1', token, T0 + 5_000);
    expect(grant.issuedAt).toBe(new Date(T0).toISOString());
    expect(await reasonOf(s.consume('u1', 'r1', token, T0 + 6_000))).toBe(
      'capture_token_invalid',
    );
  });

  it('missing / unknown / other user / other request / expired', async () => {
    const { redis } = fakeRedis();
    const s = new SelfieCaptureTokensService(redis);
    expect(await reasonOf(s.consume('u1', 'r1', undefined))).toBe(
      'capture_token_missing',
    );
    expect(await reasonOf(s.consume('u1', 'r1', 'x'.repeat(32), T0))).toBe(
      'capture_token_invalid',
    );
    const t1 = (await s.issue('u1', 'r1', T0)).token;
    expect(await reasonOf(s.consume('u2', 'r1', t1, T0))).toBe(
      'capture_token_invalid',
    );
    const t2 = (await s.issue('u1', 'r1', T0)).token;
    expect(await reasonOf(s.consume('u1', 'r2', t2, T0))).toBe(
      'capture_token_invalid',
    );
    const t3 = (await s.issue('u1', 'r1', T0)).token;
    expect(
      await reasonOf(
        s.consume('u1', 'r1', t3, T0 + SELFIE_CAPTURE_TOKEN_TTL_SEC * 1000),
      ),
    ).toBe('capture_token_expired');
  });

  it('restore puts a spent token back while it is still valid', async () => {
    const { redis } = fakeRedis();
    const s = new SelfieCaptureTokensService(redis);
    const { token } = await s.issue('u1', 'r1', T0);
    const grant = await s.consume('u1', 'r1', token, T0 + 1_000);
    await s.restore('u1', 'r1', token, grant, T0 + 2_000);
    await expect(
      s.consume('u1', 'r1', token, T0 + 3_000),
    ).resolves.toBeDefined();
    // After expiry there is nothing to restore.
    await s.restore(
      'u1',
      'r1',
      token,
      grant,
      T0 + SELFIE_CAPTURE_TOKEN_TTL_SEC * 1000 + 1,
    );
    expect(await reasonOf(s.consume('u1', 'r1', token, T0 + 4_000))).toBe(
      'capture_token_invalid',
    );
  });
});

describe('selfie capture record', () => {
  it('stores the app report plus the server check; reads it back', () => {
    const meta = selfieCaptureMeta(
      {
        captureMeta: {
          liveness: 'passed',
          challenge: 'blink',
          faceDetected: true,
          cardDetected: false,
          framesCaptured: 2,
          startedAt: '2026-10-28T12:00:00.000Z',
          capturedAt: '2026-10-28T12:00:06.000Z',
          platform: 'ios',
          deviceModel: 'iPhone15,2',
        },
      },
      {
        issuedAt: '2026-10-28T11:59:59.000Z',
        usedAt: '2026-10-28T12:00:09.000Z',
      },
    );
    const dto = selfieCaptureDto(meta as never);
    expect(dto).toMatchObject({
      source: 'app_camera',
      tokenVerified: true,
      liveness: 'passed',
      challenge: 'blink',
      fallbackReason: null,
      cardDetected: false,
      framesCaptured: 2,
      deviceModel: 'iPhone15,2',
    });
  });

  it('a selfie without a report (switch off, old app) says so', () => {
    const dto = selfieCaptureDto(selfieCaptureMeta({}, null) as never);
    expect(dto).toMatchObject({
      source: 'unknown',
      tokenVerified: false,
      liveness: 'not_checked',
    });
    expect(selfieCaptureDto(null)).toBeNull();
  });
});
