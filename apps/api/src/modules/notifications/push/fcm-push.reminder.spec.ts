import type { PinoLogger } from 'nestjs-pino';
import { FcmPushSender } from './fcm-push.sender';
import type { PushTokensService } from './push-tokens.service';

/** Owner 2026-10-20: the planner reminder push — one id per task, the app
 * that keeps its own alarm shows it itself (data-only), iOS gets it
 * time-sensitive. */
describe('FcmPushSender planner reminder', () => {
  const sent: Record<string, unknown>[] = [];

  function build() {
    sent.length = 0;
    const tokens = {
      activeTokens: jest.fn().mockResolvedValue(['plain', 'local']),
      localReminderTokens: jest.fn().mockResolvedValue(['local']),
      webTokens: jest.fn().mockResolvedValue([]),
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
    title: 'Task reminder',
    body: 'Meeting · 14:30',
    data: { type: 'task_reminder', taskId: 't1', notificationId: 'n1' },
    sound: 'notification' as const,
    reminder: true,
  };

  it('a device with local reminders gets a data-only high-priority message', async () => {
    await build().send(message, 'n:n1');
    const local = sent.find((m) => m.token === 'local') as Record<string, any>;
    expect(local.notification).toBeUndefined();
    expect(local.data).toMatchObject({
      taskId: 't1',
      title: 'Task reminder',
      body: 'Meeting · 14:30',
    });
    expect(local.android).toMatchObject({ priority: 'high' });
  });

  it('other devices get an alert grouped per task, time-sensitive on iOS', async () => {
    await build().send(message, 'n:n1');
    const plain = sent.find((m) => m.token === 'plain') as Record<string, any>;
    expect(plain.notification).toEqual({
      title: 'Task reminder',
      body: 'Meeting · 14:30',
    });
    expect(plain.android.notification.tag).toBe('task:t1');
    expect(plain.apns.payload.aps['interruption-level']).toBe('time-sensitive');
    expect(plain.apns.headers['apns-collapse-id']).toBe('task:t1');
  });

  it('an ordinary push is untouched', async () => {
    await build().send({ ...message, reminder: undefined }, 'n:n2');
    const plain = sent.find((m) => m.token === 'plain') as Record<string, any>;
    expect(plain.android.notification.tag).toBeUndefined();
    expect(plain.apns.payload.aps['interruption-level']).toBeUndefined();
  });
});
