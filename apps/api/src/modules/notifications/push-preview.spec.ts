import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PinoLogger } from 'nestjs-pino';
import { SendMessageDto } from '../chat/chat.dto';
import { PushTokenDto } from './notifications-api.dto';
import { FcmPushSender } from './push/fcm-push.sender';
import {
  MAX_PUSH_PREVIEWS,
  parsePreviewKey,
  pushPreviewKeyId,
  readPreviewKeys,
  sealedPreviewMap,
} from './push-preview';
import type { PushTokensService } from './push/push-tokens.service';

/** M12 (owner 26.11, WhatsApp): the text of an end-to-end encrypted message
 * in its push — sealed by the sender to each phone's push-preview key; the
 * server only forwards each phone its own sealed blob. */
describe('push preview (M12)', () => {
  const keyA = Buffer.alloc(32, 1);
  const keyB = Buffer.alloc(32, 2);

  it('a key id is a short hash of the key, never the token', () => {
    const id = pushPreviewKeyId(keyA);
    expect(id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(pushPreviewKeyId(keyA)).toBe(id);
    expect(pushPreviewKeyId(keyB)).not.toBe(id);
  });

  it('only a 32-byte key is taken', () => {
    expect(parsePreviewKey(keyA.toString('base64'))).toEqual(keyA);
    expect(parsePreviewKey(Buffer.alloc(31).toString('base64'))).toBeNull();
    expect(parsePreviewKey(undefined)).toBeNull();
  });

  it('the previews of a send become a key id → blob map (capped)', () => {
    expect(sealedPreviewMap(undefined)).toBeUndefined();
    expect(sealedPreviewMap([])).toBeUndefined();
    const many = Array.from({ length: 40 }, (_, i) => ({
      keyId: `k${i}`,
      sealed: 'AAAA',
    }));
    expect(Object.keys(sealedPreviewMap(many)!)).toHaveLength(
      MAX_PUSH_PREVIEWS,
    );
  });

  it('readPreviewKeys: phones only, ≤ perUser each, one per key', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { user_id: 'u1', preview_key: new Uint8Array(keyA) },
      { user_id: 'u1', preview_key: new Uint8Array(keyA) },
      { user_id: 'u1', preview_key: new Uint8Array(keyB) },
      { user_id: 'u2', preview_key: new Uint8Array(Buffer.alloc(32, 3)) },
      { user_id: 'u2', preview_key: new Uint8Array(Buffer.alloc(5)) },
    ]);
    const keys = await readPreviewKeys(
      { pushToken: { findMany } } as never,
      ['u1', 'u2'],
      1,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: { in: ['u1', 'u2'] },
          platform: { in: ['ios', 'android'] },
          preview_key: { not: null },
        },
      }),
    );
    expect(keys).toEqual([
      {
        userId: 'u1',
        keyId: pushPreviewKeyId(keyA),
        publicKey: keyA.toString('base64'),
      },
      {
        userId: 'u2',
        keyId: pushPreviewKeyId(Buffer.alloc(32, 3)),
        publicKey: Buffer.alloc(32, 3).toString('base64'),
      },
    ]);
    expect(
      await readPreviewKeys({ pushToken: { findMany } } as never, []),
    ).toEqual([]);
  });

  describe('DTOs', () => {
    it('PushTokenDto takes a 32-byte base64 key, refuses others', async () => {
      const base = { token: 'x'.repeat(30), platform: 'ios' };
      expect(
        await validate(
          plainToInstance(PushTokenDto, {
            ...base,
            previewKey: keyA.toString('base64'),
          }),
        ),
      ).toHaveLength(0);
      expect(
        await validate(
          plainToInstance(PushTokenDto, { ...base, previewKey: 'abc' }),
        ),
      ).not.toHaveLength(0);
    });

    it('SendMessageDto validates each sealed preview', async () => {
      const ok = plainToInstance(SendMessageDto, {
        clientMessageId: '0193b2c4-1111-7000-8000-000000000001',
        type: 'mls',
        pushPreviews: [{ keyId: pushPreviewKeyId(keyA), sealed: 'AAAA' }],
      });
      expect(
        (await validate(ok)).filter((e) => e.property === 'pushPreviews'),
      ).toHaveLength(0);
      const bad = plainToInstance(SendMessageDto, {
        clientMessageId: '0193b2c4-1111-7000-8000-000000000001',
        type: 'mls',
        pushPreviews: [{ keyId: 'not a key id', sealed: 'A'.repeat(2000) }],
      });
      expect(
        (await validate(bad)).filter((e) => e.property === 'pushPreviews'),
      ).toHaveLength(1);
    });
  });

  describe('FcmPushSender', () => {
    const sent: Record<string, any>[] = [];

    function build() {
      sent.length = 0;
      const tokens = {
        activeDevices: jest.fn().mockResolvedValue([
          { token: 'iphone', fid: true, previewKeyId: 'kA' },
          { token: 'android', fid: true, previewKeyId: 'kB' },
          { token: 'old', fid: false },
        ]),
        chatStyleTokens: jest.fn().mockResolvedValue(['android']),
        localReminderTokens: jest.fn().mockResolvedValue([]),
        webTokens: jest.fn().mockResolvedValue([]),
        armedReminders: jest.fn().mockResolvedValue(new Map()),
        remove: jest.fn(),
      } as unknown as PushTokensService;
      const redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
      const logger = { setContext: jest.fn(), warn: jest.fn() };
      const sender = new FcmPushSender(
        { projectId: 'p', clientEmail: 'a@b.c', privateKey: 'k' },
        tokens,
        redis as never,
        logger as unknown as PinoLogger,
      );
      (sender as unknown as { jwt: unknown }).jwt = {
        getAccessToken: () => Promise.resolve({ token: 't' }),
      };
      global.fetch = jest.fn((_url: unknown, init: { body: string }) => {
        sent.push(JSON.parse(init.body).message);
        return Promise.resolve({ ok: true });
      }) as never;
      return sender;
    }

    const message = {
      userId: 'u',
      title: 'Ann Lee',
      body: 'У вас новое сообщение.',
      data: {
        type: 'new_message',
        conversationId: 'c1',
        style: 'chat',
        text: 'У вас новое сообщение.',
      },
      chat: true,
      sealedPreviews: { kA: 'SEALED-A', kB: 'SEALED-B', kX: 'SEALED-X' },
    };

    it('each phone gets only the blob sealed to its own key', async () => {
      await build().send(message, 'm:m1');
      const by = (t: string) => sent.find((m) => m.fid === t || m.token === t)!;
      expect(by('iphone').data.sealed).toBe('SEALED-A');
      expect(by('iphone').apns.payload.aps['mutable-content']).toBe(1);
      // The Android app that draws chats itself: data-only, with its blob.
      expect(by('android').notification).toBeUndefined();
      expect(by('android').data.sealed).toBe('SEALED-B');
      // An older app without a key: as before, no blob.
      expect(by('old').data.sealed).toBeUndefined();
      expect(by('old').notification.body).toBe('У вас новое сообщение.');
      expect(JSON.stringify(sent)).not.toContain('SEALED-X');
    });

    it('without sealed previews nothing changes', async () => {
      const plain = { ...message, sealedPreviews: undefined };
      await build().send(plain, 'm:m2');
      expect(sent.every((m) => m.data.sealed === undefined)).toBe(true);
    });
  });
});
