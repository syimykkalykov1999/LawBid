import { HttpException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type {
  AuthEventService,
  RateLimitService,
} from '../../auth/auth.public';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  HANDOFF_CREATE_LIMIT,
  HANDOFF_TTL_SEC,
  VerificationHandoffService,
} from './verification-handoff.service';
import { VerificationRequestsService } from './verification-requests.service';

/** Minimal in-memory Redis: GET / SET EX / TTL / MULTI…EXEC. */
function fakeRedis() {
  const store = new Map<string, string>();
  const set = jest.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve('OK');
  });
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set,
    ttl: jest.fn(() => Promise.resolve(300)),
    multi: () => {
      const ops: [string, string][] = [];
      const chain = {
        set: (key: string, value: string) => {
          ops.push([key, value]);
          return chain;
        },
        exec: () => {
          for (const [k, v] of ops) store.set(k, v);
          return Promise.resolve([]);
        },
      };
      return chain;
    },
  };
  return { store, redis: redis as unknown as Redis };
}

function setup(allowed = true) {
  const { store, redis } = fakeRedis();
  const consumeFixedWindow = jest.fn(() =>
    Promise.resolve({ allowed, remaining: 0, retryAfterSeconds: 60 }),
  );
  const record = jest.fn(() => Promise.resolve());
  const config = {
    get: (k: string) =>
      k === 'APP_LINK_BASE_URL' ? 'https://lawbid.dev/' : undefined,
  } as unknown as ConfigService;
  const service = new VerificationHandoffService(
    redis,
    { consumeFixedWindow } as unknown as RateLimitService,
    { record } as unknown as AuthEventService,
    config,
  );
  return { service, store, consumeFixedWindow, record };
}

async function failure(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected a failure');
}

function reasonOf(e: HttpException): string | undefined {
  const body = e.getResponse() as { details?: { reason?: string } };
  return body.details?.reason;
}

describe('VerificationHandoffService (R-146 «continue on your phone»)', () => {
  const T0 = Date.UTC(2026, 10, 4, 12, 0, 0);

  it('makes a short one-time link valid 10 minutes; only a hash is stored', async () => {
    const { service, store, record } = setup();
    const a = await service.create('u1', 'r1', '203.0.113.5', T0);
    const b = await service.create('u1', 'r1', undefined, T0);
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.url).toBe(`https://lawbid.dev/selfie/${a.token}`);
    expect(Date.parse(a.expiresAt) - T0).toBe(HANDOFF_TTL_SEC * 1000);
    expect(HANDOFF_TTL_SEC).toBeLessThanOrEqual(600);
    for (const [k, v] of store) {
      expect(k).not.toContain(a.token);
      expect(v).not.toContain(a.token);
    }
    // Journaled for the attorney (auth_events), with the request.
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        eventType: 'verification_handoff_created',
        ip: '203.0.113.5',
        meta: { requestId: 'r1' },
      }),
    );
  });

  it('is rate-limited per attorney (429 RATE_LIMITED)', async () => {
    const { service, consumeFixedWindow } = setup(false);
    const e = await failure(service.create('u1', 'r1', undefined, T0));
    expect(e.getStatus()).toBe(429);
    expect((e.getResponse() as { code: string }).code).toBe(
      ErrorCode.RATE_LIMITED,
    );
    expect(consumeFixedWindow).toHaveBeenCalledWith(
      ['verif-handoff', 'u1'],
      HANDOFF_CREATE_LIMIT,
      3600,
    );
  });

  it('status: pending → done when the selfie arrives (by token or by request)', async () => {
    const { service, record } = setup();
    const { token } = await service.create('u1', 'r1', undefined, T0);
    expect((await service.status('u1', token, T0 + 1000)).status).toBe(
      'pending',
    );
    // The phone attached the selfie without the token (signed in by
    // itself): the request's open code still flips.
    await service.markDone('u1', 'r1', undefined, T0 + 2000);
    const s = await service.status('u1', token, T0 + 3000);
    expect(s).toEqual({
      status: 'done',
      requestId: 'r1',
      expiresAt: new Date(T0 + HANDOFF_TTL_SEC * 1000).toISOString(),
    });
    // Stays done after the 10 minutes (the computer may read it late).
    expect(
      (await service.status('u1', token, T0 + HANDOFF_TTL_SEC * 1000 + 1))
        .status,
    ).toBe('done');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'verification_handoff_done' }),
    );
  });

  it('status: expired after 10 minutes without a selfie', async () => {
    const { service } = setup();
    const { token } = await service.create('u1', 'r1', undefined, T0);
    expect(
      (await service.status('u1', token, T0 + HANDOFF_TTL_SEC * 1000)).status,
    ).toBe('expired');
  });

  it("someone else's or an unknown code is a 404", async () => {
    const { service } = setup();
    const { token } = await service.create('u1', 'r1', undefined, T0);
    await expect(service.status('u2', token, T0)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.status('u1', 'AAAAAAAAAAAAAAAAAAAAAA', T0),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the phone’s token must be bound to the same attorney and request', async () => {
    const { service } = setup();
    const { token } = await service.create('u1', 'r1', undefined, T0);
    await expect(
      service.assertUsable('u1', 'r1', token, T0 + 1000),
    ).resolves.toBeUndefined();
    expect(
      reasonOf(await failure(service.assertUsable('u1', 'r2', token, T0))),
    ).toBe('handoff_token_invalid');
    expect(
      reasonOf(await failure(service.assertUsable('u2', 'r1', token, T0))),
    ).toBe('handoff_token_invalid');
    const late = await failure(
      service.assertUsable('u1', 'r1', token, T0 + HANDOFF_TTL_SEC * 1000),
    );
    expect(late.getStatus()).toBe(400);
    expect(reasonOf(late)).toBe('handoff_token_expired');
  });

  it("a selfie on another request never completes this request's code", async () => {
    const { service } = setup();
    const { token } = await service.create('u1', 'r1', undefined, T0);
    await service.markDone('u1', 'r2', token, T0 + 1000);
    expect((await service.status('u1', token, T0 + 2000)).status).toBe(
      'pending',
    );
  });
});

describe('VerificationRequestsService.createHandoff (R-146 binding)', () => {
  function requests(row: { attorney_id: string; status: string } | null) {
    const prisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            role: 'attorney',
            attorney_profile: { verification_status: 'pending' },
          }),
        ),
      },
      verificationRequest: {
        findUnique: jest.fn(() =>
          Promise.resolve(row && { id: 'r1', documents: [], ...row }),
        ),
      },
    } as unknown as PrismaService;
    const handoff = {
      create: jest.fn(() =>
        Promise.resolve({
          token: 't'.repeat(22),
          url: `https://lawbid.dev/selfie/${'t'.repeat(22)}`,
          expiresAt: '2026-11-04T12:10:00.000Z',
        }),
      ),
    };
    const service = new VerificationRequestsService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      handoff as unknown as VerificationHandoffService,
    );
    return { service, handoff };
  }

  it('returns url = qrPayload for the own editable request', async () => {
    const { service, handoff } = requests({
      attorney_id: 'u1',
      status: 'draft',
    });
    const out = await service.createHandoff('u1', 'r1', '198.51.100.1');
    expect(out.qrPayload).toBe(out.url);
    expect(out.url).toMatch(/^https:\/\/lawbid\.dev\/selfie\//);
    expect(handoff.create).toHaveBeenCalledWith('u1', 'r1', '198.51.100.1');
  });

  it("someone else's request is a 404, a submitted one a 409", async () => {
    const other = requests({ attorney_id: 'u2', status: 'draft' });
    await expect(
      other.service.createHandoff('u1', 'r1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(other.handoff.create).not.toHaveBeenCalled();

    const sent = requests({ attorney_id: 'u1', status: 'pending' });
    const e = await failure(sent.service.createHandoff('u1', 'r1'));
    expect(e.getStatus()).toBe(409);
    expect(sent.handoff.create).not.toHaveBeenCalled();
  });
});
