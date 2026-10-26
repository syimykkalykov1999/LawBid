import type { PinoLogger } from 'nestjs-pino';
import { FcmPushSender } from './fcm-push.sender';
import type { PushTokensService } from './push-tokens.service';

/** Owner 2026-10-22 (WhatsApp): an Android app that draws chat
 * notifications itself gets the message data-only; every other device keeps
 * the normal alert, stacked per chat on the iPhone. */
describe('FcmPushSender chat-style message', () => {
  const sent: Record<string, any>[] = [];

  function build() {
    sent.length = 0;
    const chatStyleTokens = jest.fn().mockResolvedValue(['own']);
    const tokens = {
      activeTokens: jest.fn().mockResolvedValue(['old', 'own', 'iphone']),
      chatStyleTokens,
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
    return { sender, chatStyleTokens };
  }

  const message = {
    userId: 'u',
    title: 'Ann Lee',
    body: 'hi',
    data: {
      type: 'new_message',
      conversationId: 'c1',
      style: 'chat',
      senderName: 'Ann Lee',
      text: 'hi',
    },
    sound: 'message' as const,
    collapseKey: 'msg-m1',
    threadId: 'c1',
    chat: true,
  };

  it('the app that draws chats itself gets a data-only message', async () => {
    const { sender } = build();
    await sender.send(message, 'm:m1');
    const own = sent.find((m) => m.token === 'own')!;
    expect(own.notification).toBeUndefined();
    expect(own.android).toEqual({ priority: 'high' });
    expect(own.data).toMatchObject({
      style: 'chat',
      senderName: 'Ann Lee',
      title: 'Ann Lee',
      body: 'hi',
    });
  });

  it('an older app keeps the alert; iPhones stack it per chat', async () => {
    const { sender } = build();
    await sender.send(message, 'm:m1');
    const old = sent.find((m) => m.token === 'old')!;
    expect(old.notification).toEqual({ title: 'Ann Lee', body: 'hi' });
    expect(old.android.notification.tag).toBe('msg-m1');
    const iphone = sent.find((m) => m.token === 'iphone')!;
    expect(iphone.apns.payload.aps['thread-id']).toBe('c1');
    expect(iphone.apns.payload.aps['mutable-content']).toBe(1);
    expect(iphone.apns.headers['apns-collapse-id']).toBe('msg-m1');
  });

  it('only a chat push looks the chat-style devices up', async () => {
    const { sender, chatStyleTokens } = build();
    await sender.send({ ...message, chat: undefined }, 'm:m2');
    expect(chatStyleTokens).not.toHaveBeenCalled();
    expect(sent.every((m) => m.notification)).toBe(true);
  });

  // Owner 2026-10-22 (inbox 29): the app draws this alert itself, so it is
  // told to use the channel without a launcher badge; iPhones get badge 0.
  it('icon badge off: the data-only chat says so, iPhones get badge 0', async () => {
    const { sender } = build();
    await sender.send({ ...message, badge: 0, iconBadge: false }, 'm:m2');
    expect(sent.find((m) => m.token === 'own')!.data.iconBadge).toBe('0');
    expect(sent.find((m) => m.token === 'iphone')!.apns.payload.aps.badge).toBe(
      0,
    );
    expect(
      sent.find((m) => m.token === 'old')!.android.notification.channel_id,
    ).toBe('chats_nobadge');
  });

  it('icon badge on: no flag in the data-only chat', async () => {
    const { sender } = build();
    await sender.send({ ...message, badge: 4 }, 'm:m3');
    expect(sent.find((m) => m.token === 'own')!.data.iconBadge).toBeUndefined();
  });
});
