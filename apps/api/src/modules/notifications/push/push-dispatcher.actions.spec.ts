import { PushDispatcher } from './push-dispatcher';
import { pushActionKey, verifyPushAction } from './push-action-token';
import type {
  MessageJobData,
  NotificationJobData,
  PushMessage,
} from './push.constants';

/** Owner 2026-10-26 (WhatsApp, «полный фарш»): chat pushes carry the ticket
 * of their «Ответить» / «Прочитано» buttons and the iPhone category; other
 * notifications carry the person behind them (name + photo) — an attorney
 * only, a client stays anonymous like in the bell list. */
const PEPPER = 'p'.repeat(40);

const people: Record<string, Record<string, unknown>> = {
  me: { status: 'active', ui_language: 'ru', first_name: 'Me' },
  ann: {
    role: 'attorney',
    first_name: 'Ann',
    last_name: 'Lee',
    avatar_file_id: 'f-ann',
    client_profile: null,
    attorney_profile: { username: 'ann' },
  },
  cli: {
    role: 'client',
    first_name: 'Carl',
    last_name: 'Smith',
    avatar_file_id: 'f-cli',
    client_profile: { username: 'carl' },
    attorney_profile: null,
  },
};

const message = {
  created_at: new Date(5000),
  body_display: 'привет',
  body: 'привет',
  type: 'text',
  duration_ms: null,
  deleted_at: null,
  revoked_at: null,
  sender_id: 'ann',
  sent_by_name: null,
  file: null,
  mention_ids: [],
  poll: null,
};

function setup(notification?: Record<string, unknown>) {
  const sent: PushMessage[] = [];
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(people[where.id] ?? null),
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
    notification: { findUnique: () => Promise.resolve(notification ?? null) },
    notificationSetting: { findUnique: () => Promise.resolve(null) },
    notificationQuietHours: { findUnique: () => Promise.resolve(null) },
  };
  const files = {
    avatarUrlsMany: (ids: (string | null)[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter((x): x is string => !!x)
            .map((id) => [
              id,
              { url: `https://cdn/${id}`, url256: `https://cdn/256/${id}` },
            ]),
        ),
      ),
  };
  const d = new PushDispatcher(
    { mode: 'worker' },
    {
      get: (k: string) => (k === 'AUTH_EVENT_PEPPER' ? PEPPER : undefined),
    } as never,
    prisma as never,
    {
      render: () => Promise.resolve({ title: 'LawBid', body: 'Новое' }),
      renderFor: () =>
        Promise.resolve({ title: 'Новый комментарий', body: 'к вашему посту' }),
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
      notificationsChanged: () => Promise.resolve(),
      topicSwitches: () => Promise.resolve({ on: () => true, raw: {} }),
    } as never,
    {
      isViewing: () => Promise.resolve(false),
      toUsers: () => undefined,
    } as never,
    { setContext: () => undefined, warn: () => undefined } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    files as never,
    undefined,
    { boolean: () => Promise.resolve(true) } as never,
  );
  return { d, sent };
}

const key = pushActionKey(PEPPER);

describe('PushDispatcher notification buttons and people', () => {
  it('1:1 chat push: a ticket for this recipient and chat + the iPhone category', async () => {
    const { d, sent } = setup();
    const job: MessageJobData = {
      kind: 'message',
      recipientId: 'me',
      conversationId: 'c1',
      messageId: 'm1',
    };
    expect(await d.dispatch(job, 'j')).toBe('sent');
    const m = sent[0];
    expect(m.iosCategory).toBe('chat_message');
    expect(verifyPushAction(key, m.data.actionToken)).toMatchObject({
      u: 'me',
      c: 'c1',
      g: 0,
    });
  });

  it('group chat push: the ticket names the group', async () => {
    const { d, sent } = setup();
    const job: MessageJobData = {
      kind: 'message',
      recipientId: 'me',
      conversationId: 'g1',
      groupId: 'g1',
      messageId: 'm1',
    };
    expect(await d.dispatch(job, 'j')).toBe('sent');
    const m = sent[0];
    expect(m.iosCategory).toBe('chat_message');
    expect(verifyPushAction(key, m.data.actionToken)).toMatchObject({
      u: 'me',
      c: 'g1',
      g: 1,
    });
  });

  const note = (actorId: string) => ({
    id: 'n1',
    type: 'post_comment',
    category: 'social',
    payload: { postId: 'p1', commentId: 'k1', actorId },
    read_at: null,
    user_id: 'me',
    user: {
      ui_language: 'ru',
      timezone: 'UTC',
      quiet_hours: null,
      status: 'active',
      email: null,
      email_verified_at: null,
    },
  });
  const job: NotificationJobData = {
    kind: 'notification',
    notificationId: 'n1',
  };

  it('a comment by an attorney: their name and round photo travel with it', async () => {
    const { d, sent } = setup(note('ann'));
    expect(await d.dispatch(job, 'j')).toBe('sent');
    const m = sent[0];
    expect(m.actor).toBe(true);
    expect(m.data).toMatchObject({
      type: 'post_comment',
      postId: 'p1',
      style: 'actor',
      actorName: 'Ann Lee',
      actorAvatar: 'https://cdn/256/f-ann',
      actorAvatarKey: 'f-ann',
    });
    expect(m.data.actionToken).toBeUndefined();
  });

  it('a comment by a client: anonymous — no name, no photo', async () => {
    const { d, sent } = setup(note('cli'));
    expect(await d.dispatch(job, 'j')).toBe('sent');
    const m = sent[0];
    expect(m.actor).toBeUndefined();
    expect(m.data.actorName).toBeUndefined();
    expect(JSON.stringify(m)).not.toContain('f-cli');
  });
});
