import type { PinoLogger } from 'nestjs-pino';
import { FcmPushSender } from './fcm-push.sender';
import type { PushTokensService } from './push-tokens.service';
import {
  isPushPreviewKey,
  loadPushPreviews,
  pushPreviewKid,
  storePushPreviews,
} from '../../../common/push-previews/push-previews';

/** Third pass M12: each phone's push carries only the preview sealed to its
 * own key (`data.pp`); devices without a key, or without a sealed preview,
 * get the push as before («Новое сообщение»). */
describe('FcmPushSender sealed push previews', () => {
  const sent: Record<string, any>[] = [];

  function build() {
    sent.length = 0;
    const tokens = {
      activeDevices: jest.fn().mockResolvedValue([
        { token: 'iphone', fid: false, previewKid: 'kid-iphone-00000' },
        { token: 'android', fid: false, previewKid: 'kid-android-0000' },
        { token: 'old', fid: false, previewKid: null },
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
    data: { type: 'new_message', conversationId: 'c1', style: 'chat' },
    sound: 'message' as const,
    threadId: 'c1',
    chat: true,
    previews: {
      'kid-iphone-00000': 'Y3QtaXBob25l',
      'kid-android-0000': 'Y3QtYW5kcm9pZA==',
      'kid-someone-else': 'b3RoZXI=',
    },
  };

  it('each device gets only its own sealed preview', async () => {
    await build().send(message, 'm:pp1');
    const by = (t: string) => sent.find((m) => m.token === t)!;
    expect(by('iphone').data.pp).toBe('Y3QtaXBob25l');
    expect(by('iphone').apns.payload.aps['mutable-content']).toBe(1);
    expect(by('android').data.pp).toBe('Y3QtYW5kcm9pZA==');
    expect(by('android').notification).toBeUndefined();
    expect(by('old').data.pp).toBeUndefined();
    for (const m of sent) expect(JSON.stringify(m)).not.toContain('b3RoZXI=');
  });

  it('a push without previews is unchanged', async () => {
    await build().send({ ...message, previews: undefined }, 'm:pp2');
    for (const m of sent) expect(m.data.pp).toBeUndefined();
  });
});

describe('push-previews helpers', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('checks keys and derives a stable 16-char id', () => {
    expect(isPushPreviewKey(key)).toBe(true);
    expect(isPushPreviewKey('short')).toBe(false);
    expect(isPushPreviewKey(null)).toBe(false);
    expect(pushPreviewKid(key)).toHaveLength(16);
    expect(pushPreviewKid(key)).toBe(pushPreviewKid(key));
    expect(pushPreviewKid(key)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('stores with a TTL and reads back; Redis errors never throw', async () => {
    const store = new Map<string, string>();
    const redis = {
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    };
    await storePushPreviews(redis as never, 'm1', [{ kid: 'a', ct: 'Yg==' }]);
    expect(redis.set).toHaveBeenCalledWith(
      'push:pp:m1',
      '{"a":"Yg=="}',
      'EX',
      expect.any(Number),
    );
    expect(await loadPushPreviews(redis as never, 'm1')).toEqual({
      a: 'Yg==',
    });
    expect(await loadPushPreviews(redis as never, 'none')).toEqual({});
    const broken = {
      set: jest.fn().mockRejectedValue(new Error('down')),
      get: jest.fn().mockRejectedValue(new Error('down')),
    };
    await expect(
      storePushPreviews(broken as never, 'm1', [{ kid: 'a', ct: 'Yg==' }]),
    ).resolves.toBeUndefined();
    expect(await loadPushPreviews(broken as never, 'm1')).toEqual({});
    expect(await loadPushPreviews(undefined, 'm1')).toEqual({});
  });
});
