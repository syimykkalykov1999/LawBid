import { NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type {
  BunnyKeys,
  BunnyStreamClient,
} from '../videos/bunny-stream.client';
import {
  BunnyWebhookController,
  bunnySignatureValid,
} from './bunny-webhook.controller';
import type { PostVideosService } from './post-videos.service';

const GUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz';
const SIGNING_KEY = 'ro-key-0123456789abcdefghij';

function keys(extra: Partial<BunnyKeys> = {}): BunnyKeys {
  return {
    libraryId: '1',
    cdnHostname: 'vz.b-cdn.net',
    apiKey: 'api-key-0123456789abcdefgh',
    tokenAuthKey: 'token-auth-key-0123',
    webhookToken: TOKEN,
    ...extra,
  };
}

function sign(raw: Buffer, key = SIGNING_KEY): string {
  return createHmac('sha256', key).update(raw).digest('hex');
}

function setup(k: BunnyKeys | null) {
  const onWebhook = jest.fn().mockResolvedValue(undefined);
  const ctrl = new BunnyWebhookController(
    { keys: jest.fn().mockResolvedValue(k) } as unknown as BunnyStreamClient,
    { onWebhook } as unknown as PostVideosService,
  );
  const warn = jest
    .spyOn(
      (ctrl as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    )
    .mockImplementation(() => undefined);
  return { ctrl, onWebhook, warn };
}

const body = { VideoGuid: GUID, Status: 3 };
const raw = Buffer.from(JSON.stringify(body));

describe('bunnySignatureValid', () => {
  it('accepts the hex HMAC-SHA256 of the raw body (any case)', () => {
    expect(bunnySignatureValid(raw, sign(raw), SIGNING_KEY)).toBe(true);
    expect(bunnySignatureValid(raw, sign(raw).toUpperCase(), SIGNING_KEY)).toBe(
      true,
    );
  });

  it('rejects a missing, malformed, wrong-key or tampered signature', () => {
    expect(bunnySignatureValid(raw, undefined, SIGNING_KEY)).toBe(false);
    expect(bunnySignatureValid(raw, 'abc', SIGNING_KEY)).toBe(false);
    expect(bunnySignatureValid(raw, sign(raw, 'other'), SIGNING_KEY)).toBe(
      false,
    );
    const tampered = Buffer.from(raw.toString().replace('3', '4'));
    expect(bunnySignatureValid(tampered, sign(raw), SIGNING_KEY)).toBe(false);
  });
});

describe('BunnyWebhookController', () => {
  describe('with a signing key (HMAC)', () => {
    it('accepts a signed request on the token-less path', async () => {
      const { ctrl, onWebhook, warn } = setup(
        keys({ webhookSigningKey: SIGNING_KEY }),
      );
      await expect(
        ctrl.bunnySigned({ rawBody: raw }, sign(raw), body),
      ).resolves.toEqual({ received: true });
      expect(onWebhook).toHaveBeenCalledWith(GUID);
      expect(warn).not.toHaveBeenCalled();
    });

    it('accepts a signed request on the old path even with a stale token', async () => {
      const { ctrl, onWebhook } = setup(
        keys({ webhookSigningKey: SIGNING_KEY }),
      );
      await ctrl.bunnyWebhook('stale', { rawBody: raw }, sign(raw), body);
      expect(onWebhook).toHaveBeenCalledWith(GUID);
    });

    it('rejects the right URL token without a valid signature', async () => {
      const { ctrl, onWebhook } = setup(
        keys({ webhookSigningKey: SIGNING_KEY }),
      );
      await expect(
        ctrl.bunnyWebhook(TOKEN, { rawBody: raw }, undefined, body),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        ctrl.bunnyWebhook(TOKEN, { rawBody: raw }, sign(raw, 'x'), body),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(onWebhook).not.toHaveBeenCalled();
    });

    it('rejects when the raw body is unavailable', async () => {
      const { ctrl } = setup(keys({ webhookSigningKey: SIGNING_KEY }));
      await expect(
        ctrl.bunnySigned({}, sign(raw), body),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('without a signing key (URL-token fallback)', () => {
    it('accepts the right token and warns only once', async () => {
      const { ctrl, onWebhook, warn } = setup(keys());
      await ctrl.bunnyWebhook(TOKEN, { rawBody: raw }, undefined, body);
      await ctrl.bunnyWebhook(TOKEN, { rawBody: raw }, undefined, body);
      expect(onWebhook).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong token and the token-less path', async () => {
      const { ctrl, onWebhook } = setup(keys());
      await expect(
        ctrl.bunnyWebhook('wrong', { rawBody: raw }, undefined, body),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        ctrl.bunnySigned({ rawBody: raw }, sign(raw), body),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(onWebhook).not.toHaveBeenCalled();
    });
  });

  it('is a 404 while Bunny is not configured', async () => {
    const { ctrl } = setup(null);
    await expect(
      ctrl.bunnyWebhook(TOKEN, { rawBody: raw }, undefined, body),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ignores a payload without a valid video id', async () => {
    const { ctrl, onWebhook } = setup(keys());
    await ctrl.bunnyWebhook(TOKEN, {}, undefined, { VideoGuid: 'nope' });
    expect(onWebhook).not.toHaveBeenCalled();
  });
});
