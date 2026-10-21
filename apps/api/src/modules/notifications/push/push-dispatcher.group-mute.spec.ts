import { PushDispatcher } from './push-dispatcher';
import type { MessageJobData, PushMessage } from './push.constants';

/** Owner 2026-10-21 (inbox 27, Telegram): a group muted until a moment
 * sends no push until then (a mention still breaks through); once the
 * moment passed it pushes again. */
function setup(mutedUntil: Date | null, mentioned = false) {
  const sent: PushMessage[] = [];
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'sender'
            ? { first_name: 'Otto', last_name: null }
            : { status: 'active', ui_language: 'en' },
        ),
    },
    chatGroupMember: {
      findUnique: () =>
        Promise.resolve({ muted_until: mutedUntil, left_at: null }),
    },
    chatGroupMessage: {
      findUnique: () =>
        Promise.resolve({
          body: 'hello group',
          type: 'text',
          sender_id: 'sender',
          deleted_at: null,
          system_kind: null,
          system_payload: null,
          mention_ids: mentioned ? ['u1'] : [],
          poll: null,
        }),
    },
    chatGroup: {
      findUnique: () => Promise.resolve({ title: 'Team', deleted_at: null }),
    },
    notificationSetting: { findUnique: () => Promise.resolve(null) },
    notificationQuietHours: { findUnique: () => Promise.resolve(null) },
  };
  const d = new PushDispatcher(
    { mode: 'worker' },
    {} as never,
    prisma as never,
    {} as never,
    {
      send: (message: PushMessage) => {
        sent.push(message);
        return Promise.resolve();
      },
    },
    {} as never,
    {} as never,
    { get: () => Promise.resolve({ total: 1 }) } as never,
    { isViewing: () => Promise.resolve(false) } as never,
    { setContext: () => undefined } as never,
  );
  return { d, sent };
}

const job: MessageJobData = {
  kind: 'message',
  recipientId: 'u1',
  conversationId: 'g1',
  groupId: 'g1',
  messageId: 'm1',
};

describe('PushDispatcher group mute', () => {
  const hour = 60 * 60 * 1000;

  it('sends no push while the group is muted (1 h / 8 h / 2 days / forever)', async () => {
    for (const ms of [hour, 8 * hour, 48 * hour, 3650 * 24 * hour]) {
      const { d, sent } = setup(new Date(Date.now() + ms));
      expect(await d.dispatch(job, 'j')).toBe('muted');
      expect(sent).toHaveLength(0);
    }
  });

  it('pushes again once the mute moment has passed', async () => {
    const { d, sent } = setup(new Date(Date.now() - 1000));
    expect(await d.dispatch(job, 'j')).toBe('sent');
    expect(sent).toHaveLength(1);
  });

  it('a mention breaks through the mute', async () => {
    const { d, sent } = setup(new Date(Date.now() + hour), true);
    expect(await d.dispatch(job, 'j')).toBe('sent');
    expect(sent).toHaveLength(1);
  });
});
