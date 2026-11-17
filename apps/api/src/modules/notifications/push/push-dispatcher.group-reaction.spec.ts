import { PushDispatcher } from './push-dispatcher';
import type { MessageJobData, PushMessage } from './push.constants';

/**
 * Groups WhatsApp parity: a reaction to my group message pushes «Ann:
 * Реакция 👍 «text»» to me (the author) — the 1:1 reaction push
 * (push-dispatcher.message-events.spec.ts), titled with the group — and a
 * group voice note says «🎤 Голосовое 0:12» like a 1:1 one.
 */
const people: Record<string, Record<string, unknown>> = {
  me: { status: 'active', ui_language: 'ru', first_name: 'Me' },
  other: { status: 'active', ui_language: 'ru', first_name: 'Other' },
  ann: {
    first_name: 'Ann',
    last_name: 'Lee',
    avatar_file_id: null,
    client_profile: null,
    attorney_profile: { username: 'ann' },
  },
};

const base = {
  created_at: new Date(5000),
  body: 'привет всем',
  type: 'text',
  duration_ms: null,
  deleted_at: null,
  sender_id: 'me',
  file: null,
  mention_ids: [],
  poll: null,
  system_kind: null,
  system_payload: null,
};

function setup(
  message: Record<string, unknown> = base,
  opts: { off?: string[]; muted?: boolean } = {},
) {
  const off = new Set(opts.off ?? []);
  const sent: { message: PushMessage; key: string }[] = [];
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(people[where.id] ?? null),
    },
    chatGroupMember: {
      findUnique: () =>
        Promise.resolve({
          muted_until: opts.muted ? new Date(Date.now() + 3_600_000) : null,
          left_at: null,
        }),
    },
    chatGroupMessage: { findFirst: () => Promise.resolve(message) },
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
      render: () => Promise.resolve({ title: 'LawBid', body: 'Новое' }),
    } as never,
    {
      send: (m: PushMessage, key: string) => {
        sent.push({ message: m, key });
        return Promise.resolve();
      },
    },
    {} as never,
    {} as never,
    {
      get: () => Promise.resolve({ total: 1 }),
      iconFor: () => Promise.resolve({ badge: 1, on: true }),
      mutedCategories: () => Promise.resolve(new Set(off)),
      topicSwitches: () =>
        Promise.resolve({
          on: (k: string) => !off.has(k),
          raw: Object.fromEntries([...off].map((k) => [k, false])),
        }),
    } as never,
    { isViewing: () => Promise.resolve(false) } as never,
    { setContext: () => undefined, warn: () => undefined } as never,
  );
  const job: MessageJobData = {
    kind: 'message',
    recipientId: 'me',
    conversationId: 'g1',
    groupId: 'g1',
    messageId: 'm1',
    event: 'reaction',
    actorId: 'ann',
    emoji: '👍',
  };
  return { d, sent, job };
}

describe('PushDispatcher group reaction push', () => {
  it('the author gets «Ann: Реакция 👍 «text»», grouped and deduped like 1:1', async () => {
    const { d, sent, job } = setup();
    expect(await d.dispatch(job, 'j')).toBe('sent');
    expect(sent).toHaveLength(1);
    const { message: m, key } = sent[0];
    expect(m.userId).toBe('me');
    expect(m.title).toBe('Team');
    expect(m.body).toBe('Ann: Реакция 👍 «привет всем»');
    expect(key).toBe('r:m1:ann:👍');
    expect(m.collapseKey).toBe('react-m1');
    expect(m.data).toMatchObject({
      groupId: 'g1',
      event: 'reaction',
      senderName: 'Ann Lee',
    });
  });

  it('only the author: someone else, a service line or my own reaction stays quiet', async () => {
    const other = setup();
    expect(
      await other.d.dispatch({ ...other.job, recipientId: 'other' }, 'j'),
    ).toBe('no_push');
    const sys = setup({ ...base, type: 'system', sender_id: null });
    expect(await sys.d.dispatch(sys.job, 'j')).toBe('no_push');
    const self = setup();
    expect(await self.d.dispatch({ ...self.job, actorId: 'me' }, 'j')).toBe(
      'no_push',
    );
    expect([...other.sent, ...sys.sent, ...self.sent]).toHaveLength(0);
  });

  it('«Reactions» off, «Groups» off or a muted group: no push', async () => {
    for (const s of [
      setup(base, { off: ['reactions'] }),
      setup(base, { off: ['groups'] }),
      setup(base, { muted: true }),
    ]) {
      expect(await s.d.dispatch(s.job, 'j')).not.toBe('sent');
      expect(s.sent).toHaveLength(0);
    }
  });

  it('a reaction to a voice note quotes «🎤 Голосовое 0:12»', async () => {
    const { d, sent, job } = setup({
      ...base,
      type: 'voice',
      body: '',
      duration_ms: 12_000,
    });
    await d.dispatch(job, 'j');
    expect(sent[0].message.body).toMatch(/^Ann: Реакция 👍 «🎤 .+ 0:12»$/);
  });
});

describe('PushDispatcher group voice note push', () => {
  it('a new voice note says «Ann Lee: 🎤 … 0:12», keyed by the message', async () => {
    const { d, sent, job } = setup({
      ...base,
      type: 'voice',
      body: '',
      sender_id: 'ann',
      duration_ms: 12_000,
    });
    const msg: MessageJobData = {
      kind: 'message',
      recipientId: job.recipientId,
      conversationId: job.conversationId,
      groupId: job.groupId,
      messageId: job.messageId,
    };
    expect(await d.dispatch(msg, 'j')).toBe('sent');
    expect(sent[0].key).toBe('m:m1');
    expect(sent[0].message.body).toMatch(/^Ann Lee: 🎤 .+ 0:12$/);
  });
});
