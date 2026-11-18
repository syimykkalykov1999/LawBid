import { PushDispatcher } from './push-dispatcher';
import type { NotificationJobData, PushMessage } from './push.constants';

/**
 * Verify batch 8 (17.11), NO3: a push held by quiet hours went out in the
 * morning even when the person had blocked the actor in between (or the
 * actor had blocked them, or the actor's account was suspended). The
 * stored row was written before the block; the held push is checked again
 * when it is released — WhatsApp / Instagram: nothing reaches you from
 * someone you blocked, also a notification that was waiting.
 */
function setup(opts: { blocked?: boolean; actorStatus?: string } = {}) {
  const sent: PushMessage[] = [];
  const people: Record<string, Record<string, unknown>> = {
    ann: {
      role: 'attorney',
      status: opts.actorStatus ?? 'active',
      first_name: 'Ann',
      last_name: 'Lee',
      avatar_file_id: null,
      client_profile: null,
      attorney_profile: { username: 'ann' },
    },
  };
  const notification = {
    id: 'n1',
    type: 'post_like',
    category: 'social',
    payload: { actorId: 'ann', postId: 'p1' },
    read_at: null,
    user_id: 'me',
    user: {
      ui_language: 'en',
      timezone: 'UTC',
      quiet_hours: null,
      status: 'active',
      email: null,
      email_verified_at: null,
    },
  };
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(people[where.id] ?? null),
    },
    userBlock: {
      findFirst: () =>
        Promise.resolve(opts.blocked ? { blocker_id: 'me' } : null),
    },
    notification: {
      findFirst: () => Promise.resolve(notification),
      findUnique: () => Promise.resolve(notification),
    },
    notificationSetting: { findUnique: () => Promise.resolve(null) },
    notificationQuietHours: { findUnique: () => Promise.resolve(null) },
  };
  const d = new PushDispatcher(
    { mode: 'worker' },
    { get: () => undefined } as never,
    prisma as never,
    {
      render: () => Promise.resolve({ title: 'LawBid', body: 'Like' }),
      renderFor: () => Promise.resolve({ title: 'Ann', body: 'liked' }),
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
      mutedCategories: () => Promise.resolve(new Set()),
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
    {
      avatarUrlsMany: () => Promise.resolve(new Map()),
    } as never,
    undefined,
    { boolean: () => Promise.resolve(true) } as never,
  );
  return { d, sent };
}

const held: NotificationJobData = {
  kind: 'notification',
  notificationId: 'n1',
  userId: 'me',
  push: true,
  deferred: true,
};

describe('PushDispatcher: a push held by quiet hours (NO3)', () => {
  it('is dropped when the two blocked each other while it waited', async () => {
    const { d, sent } = setup({ blocked: true });
    expect(await d.dispatch(held, 'j')).toBe('no_push');
    expect(sent).toHaveLength(0);
  });

  it('is dropped when the actor was suspended while it waited', async () => {
    const { d, sent } = setup({ actorStatus: 'suspended' });
    expect(await d.dispatch(held, 'j')).toBe('no_push');
    expect(sent).toHaveLength(0);
  });

  it('still goes out when nothing changed', async () => {
    const { d, sent } = setup();
    expect(await d.dispatch(held, 'j')).toBe('sent');
    expect(sent).toHaveLength(1);
  });
});
