import type { PinoLogger } from 'nestjs-pino';
import { apnsCollapseId, chatCollapseKey } from './chat-push';
import { FcmPushSender } from './fcm-push.sender';
import { PushDispatcher } from './push-dispatcher';
import type { PushTokensService } from './push-tokens.service';
import type { MessageJobData, PushMessage } from './push.constants';

/** Owner 2026-10-24 (P1 resilience): a burst of chat messages replaces itself
 * (per-conversation collapse), following the FCM and APNs rules; calls and
 * VoIP pushes are never collapsed that way. */
describe('chat collapse keys', () => {
  it('one key per conversation, a mention has its own', () => {
    expect(chatCollapseKey('c1')).toBe('chat-c1');
    expect(chatCollapseKey('g1', { mention: true })).toBe('chatm-g1');
  });

  it('apns-collapse-id is cut at 64 BYTES, never inside a character', () => {
    const short = 'chat-' + 'a'.repeat(36);
    expect(apnsCollapseId(short)).toBe(short);
    const cyr = 'я'.repeat(40); // 80 bytes
    const cut = apnsCollapseId(cyr);
    expect(new TextEncoder().encode(cut).length).toBeLessThanOrEqual(64);
    expect(cut).toBe('я'.repeat(32));
  });
});

describe('FcmPushSender collapse', () => {
  const sent: Record<string, any>[] = [];

  function build(chatStyle: string[] = []) {
    sent.length = 0;
    const tokens = {
      activeTokens: jest.fn().mockResolvedValue(['droid', 'own', 'iphone']),
      chatStyleTokens: jest.fn().mockResolvedValue(chatStyle),
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

  const chat: PushMessage = {
    userId: 'u',
    title: 'Ann',
    body: 'hi',
    data: { type: 'new_message', conversationId: 'c1', text: 'hi' },
    sound: 'message',
    collapseKey: chatCollapseKey('c1'),
    threadId: 'c1',
    chat: true,
  };

  it('a chat push collapses per conversation on Android and on the iPhone', async () => {
    await build().send(chat, 'm:1');
    const m = sent.find((x) => x.token === 'droid')!;
    expect(m.android.collapse_key).toBe('chat-c1');
    expect(m.android.notification.tag).toBe('chat-c1');
    expect(m.apns.headers['apns-collapse-id']).toBe('chat-c1');
    expect(m.apns.payload.aps['thread-id']).toBe('c1');
  });

  it('the Android app that draws chats itself is NOT collapsed (every line matters)', async () => {
    await build(['own']).send(chat, 'm:1');
    const own = sent.find((x) => x.token === 'own')!;
    expect(own.android).toEqual({ priority: 'high' });
    expect(own.android.collapse_key).toBeUndefined();
  });

  it('a call push carries no collapse key of the chat kind', async () => {
    await build().send(
      {
        userId: 'u',
        title: 'Call',
        body: 'Ann',
        data: { type: 'incoming_call', callId: 'k1' },
        call: true,
      },
      'call:k1',
    );
    for (const m of sent) {
      expect(m.android.collapse_key).toBeUndefined();
      expect(m.apns.headers['apns-collapse-id']).toBeUndefined();
    }
  });

  it('a long non-ASCII key still fits the 64-byte APNs limit', async () => {
    await build().send({ ...chat, collapseKey: 'я'.repeat(40) }, 'm:2');
    const m = sent.find((x) => x.token === 'iphone')!;
    expect(
      new TextEncoder().encode(m.apns.headers['apns-collapse-id']).length,
    ).toBeLessThanOrEqual(64);
  });
});

describe('PushDispatcher message collapse', () => {
  function setup(group: boolean, mention: boolean) {
    const sent: PushMessage[] = [];
    const message = {
      created_at: new Date(5000),
      body_display: 'hello',
      body: 'hello',
      type: 'text',
      duration_ms: null,
      deleted_at: null,
      revoked_at: null,
      sender_id: 'ann',
      sent_by_name: null,
      file: null,
      mention_ids: mention ? ['me'] : [],
      poll: null,
    };
    const prisma = {
      user: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'me'
              ? { status: 'active', ui_language: 'en' }
              : {
                  first_name: 'Ann',
                  last_name: null,
                  avatar_file_id: null,
                  client_profile: null,
                  attorney_profile: null,
                },
          ),
      },
      conversationParticipant: {
        findUnique: () =>
          Promise.resolve({ muted_until: null, last_read_message_id: null }),
      },
      message: { findUnique: () => Promise.resolve(message) },
      chatGroupMember: {
        findUnique: () => Promise.resolve({ muted_until: null, left_at: null }),
      },
      chatGroupMessage: { findUnique: () => Promise.resolve(message) },
      chatGroup: {
        findUnique: () =>
          Promise.resolve({
            title: 'Team',
            deleted_at: null,
            avatar_file_id: null,
          }),
      },
      notificationSetting: { findUnique: () => Promise.resolve(null) },
      notificationQuietHours: { findUnique: () => Promise.resolve(null) },
    };
    const d = new PushDispatcher(
      { mode: 'worker' },
      {} as never,
      prisma as never,
      {
        render: () => Promise.resolve({ title: 'LawBid', body: 'New' }),
      } as never,
      {
        send: (m: PushMessage) => {
          sent.push(m);
          return Promise.resolve();
        },
      },
      {} as never,
      {} as never,
      {
        iconFor: () => Promise.resolve({ badge: 1, on: true }),
        topicSwitches: () => Promise.resolve({ on: () => true, raw: {} }),
      } as never,
      { isViewing: () => Promise.resolve(false) } as never,
      { setContext: () => undefined, warn: () => undefined } as never,
    );
    const job: MessageJobData = {
      kind: 'message',
      recipientId: 'me',
      conversationId: group ? 'g1' : 'c1',
      messageId: 'm1',
      ...(group ? { groupId: 'g1' } : {}),
    };
    return { d, sent, job };
  }

  afterEach(() => {
    delete process.env.PUSH_CHAT_COLLAPSE;
  });

  it('1:1: the key is the conversation, not the message', async () => {
    const { d, sent, job } = setup(false, false);
    await d.dispatch(job, 'j');
    expect(sent[0].collapseKey).toBe('chat-c1');
  });

  it('group: per group; a @mention keeps its own key', async () => {
    const a = setup(true, false);
    await a.d.dispatch(a.job, 'j');
    expect(a.sent[0].collapseKey).toBe('chat-g1');
    const b = setup(true, true);
    await b.d.dispatch(b.job, 'j');
    expect(b.sent[0].collapseKey).toBe('chatm-g1');
  });

  it('PUSH_CHAT_COLLAPSE=0 goes back to one alert per message', async () => {
    process.env.PUSH_CHAT_COLLAPSE = '0';
    const { d, sent, job } = setup(false, false);
    await d.dispatch(job, 'j');
    expect(sent[0].collapseKey).toBe('msg-m1');
  });
});
