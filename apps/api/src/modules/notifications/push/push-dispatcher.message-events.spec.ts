import { PushDispatcher } from './push-dispatcher';
import type { MessageJobData, PushMessage } from './push.constants';

/** Owner 2026-10-20: reaction and edit pushes are grouped, not spammy. */
function setup(opts: { lastReadAt?: Date } = {}) {
  const sent: { message: PushMessage; key: string }[] = [];
  const created = new Date('2026-10-20T10:00:00Z');
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'actor'
            ? { first_name: 'Otto' }
            : { status: 'active', ui_language: 'en' },
        ),
    },
    conversationParticipant: {
      findUnique: () =>
        Promise.resolve({
          muted_until: null,
          last_read_message_id: opts.lastReadAt ? 'read' : null,
        }),
    },
    message: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'read'
            ? { created_at: opts.lastReadAt }
            : {
                created_at: created,
                body_display: 'hello there',
                type: 'text',
                duration_ms: null,
                deleted_at: null,
                revoked_at: null,
                sender_id: 'me',
                sent_by_name: null,
              },
        ),
    },
    notificationSetting: { findUnique: () => Promise.resolve(null) },
    notificationQuietHours: { findUnique: () => Promise.resolve(null) },
  };
  const d = new PushDispatcher(
    { mode: 'worker' },
    {} as never,
    prisma as never,
    {
      render: () => Promise.resolve({ title: 'New message', body: 'b' }),
    } as never,
    {
      send: (message: PushMessage, key: string) => {
        sent.push({ message, key });
        return Promise.resolve();
      },
    },
    {} as never,
    {} as never,
    {
      get: () => Promise.resolve({ total: 3 }),
      forIcon: () => Promise.resolve(3),
      topicSwitches: () =>
        Promise.resolve({ on: () => true, own: () => true, raw: {} }),
    } as never,
    { isViewing: () => Promise.resolve(false) } as never,
    { setContext: () => undefined } as never,
  );
  return { d, sent };
}

const base: MessageJobData = {
  kind: 'message',
  recipientId: 'u1',
  conversationId: 'c1',
  messageId: 'm1',
};

describe('PushDispatcher message events', () => {
  it('a new message collapses by message id', async () => {
    const { d, sent } = setup();
    expect(await d.dispatch(base, 'j')).toBe('sent');
    expect(sent[0].key).toBe('m:m1');
    expect(sent[0].message.collapseKey).toBe('msg-m1');
  });

  it('a reaction names who reacted and is deduped per person and emoji', async () => {
    const { d, sent } = setup();
    await d.dispatch(
      { ...base, event: 'reaction' as const, actorId: 'actor', emoji: '👍' },
      'j',
    );
    expect(sent[0].key).toBe('r:m1:actor:👍');
    expect(sent[0].message.body).toContain('Otto reacted 👍');
    expect(sent[0].message.collapseKey).toBe('react-m1');
  });

  it('an edit refreshes the alert of an unread message in place', async () => {
    const { d, sent } = setup();
    await d.dispatch({ ...base, event: 'edit' as const }, 'j');
    expect(sent[0].key).toBe('e:m1');
    expect(sent[0].message.body.startsWith('✏️')).toBe(true);
    expect(sent[0].message.collapseKey).toBe('msg-m1');
  });

  it('an edit of an already read message stays quiet', async () => {
    const { d, sent } = setup({ lastReadAt: new Date('2026-10-20T10:05:00Z') });
    expect(await d.dispatch({ ...base, event: 'edit' as const }, 'j')).toBe(
      'no_push',
    );
    expect(sent).toHaveLength(0);
  });
});
