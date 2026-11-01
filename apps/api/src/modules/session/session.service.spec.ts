import { SESSION_ETAG_BUCKET_MS, SessionService } from './session.service';

/** Owner 2026-10-22 (client economy plan, package G): GET /me/session —
 * the cheap ETag reads stamps only; the body is built on a miss. */
describe('SessionService', () => {
  function setup() {
    // One row of the stamps statement (users + both profiles).
    const stamps = {
      updated_at: new Date('2026-10-22T10:00:00Z'),
      a: new Date('2026-10-22T09:00:00Z'),
      c: null,
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([stamps]),
      supportTicket: { count: jest.fn().mockResolvedValue(1) },
      chatGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
      call: { findFirst: jest.fn() },
    };
    const onboarding = {
      getMe: jest.fn().mockResolvedValue({ id: 'me', role: 'attorney' }),
    };
    const badges = {
      get: jest.fn().mockResolvedValue({
        chatsUnread: 2,
        notificationsUnread: 1,
        total: 3,
      }),
      forAssistant: jest.fn(),
      withIcon: jest.fn((_: string, b: unknown) => Promise.resolve(b)),
    };
    const bootstrap = {
      build: jest.fn().mockResolvedValue({ flags: { video_posts: true } }),
    };
    const redis = { get: jest.fn().mockResolvedValue('7') };
    const service = new SessionService(
      prisma as never,
      onboarding as never,
      badges as never,
      bootstrap as never,
      redis as never,
    );
    return { service, prisma, onboarding, badges, bootstrap };
  }
  const user = { sub: 'me', role: 'attorney' } as never;

  it('builds the one-answer session', async () => {
    const { service, prisma } = setup();
    await expect(service.build(user)).resolves.toEqual({
      me: { id: 'me', role: 'attorney' },
      badges: { chatsUnread: 2, notificationsUnread: 1, total: 3 },
      bootstrapVersion: '7',
      flags: { video_posts: true },
      unreadSupport: 1,
      hasOngoingCalls: false,
    });
    // No group → the calls table is not even asked.
    expect(prisma.call.findFirst).not.toHaveBeenCalled();
  });

  it('the ETag is stable inside a bucket and moves with any stamp', async () => {
    const { service, badges, onboarding, bootstrap } = setup();
    const t0 = 1_000 * SESSION_ETAG_BUCKET_MS;
    const a = await service.etag(user, t0);
    expect(a).toMatch(/^W\/"sess-/);
    expect(await service.etag(user, t0 + SESSION_ETAG_BUCKET_MS - 1)).toBe(a);
    expect(await service.etag(user, t0 + SESSION_ETAG_BUCKET_MS)).not.toBe(a);
    badges.get.mockResolvedValue({
      chatsUnread: 3,
      notificationsUnread: 1,
      total: 4,
    });
    expect(await service.etag(user, t0)).not.toBe(a);
    // The tag never builds the body.
    expect(onboarding.getMe).not.toHaveBeenCalled();
    expect(bootstrap.build).not.toHaveBeenCalled();
  });

  it('reads the three stamps in one statement and the tag follows each', async () => {
    const { service, prisma } = setup();
    const t0 = 1_000 * SESSION_ETAG_BUCKET_MS;
    const a = await service.etag(user, t0);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const inputs = await service.inputs(user);
    expect(inputs.stamps).toEqual({
      updated_at: new Date('2026-10-22T10:00:00Z'),
      attorney_profile: { updated_at: new Date('2026-10-22T09:00:00Z') },
      client_profile: null,
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        updated_at: new Date('2026-10-22T10:00:00Z'),
        a: new Date('2026-10-22T09:30:00Z'),
        c: null,
      },
    ]);
    expect(await service.etag(user, t0)).not.toBe(a);
    // A deleted (or unknown) user: no row, no stamps.
    prisma.$queryRaw.mockResolvedValue([]);
    expect((await service.inputs(user)).stamps).toBeNull();
  });

  it('an assistant gets the attorney chats + own notifications and own support', async () => {
    const { service, badges, prisma } = setup();
    badges.forAssistant.mockResolvedValue({
      chatsUnread: 2,
      notificationsUnread: 0,
      total: 2,
    });
    const assistant = {
      sub: 'att',
      role: 'attorney',
      assistant: { userId: 'asst' },
    } as never;
    await service.build(assistant);
    expect(badges.forAssistant).toHaveBeenCalledWith('att', 'asst');
    expect(prisma.supportTicket.count).toHaveBeenCalledWith({
      where: { user_id: 'asst', unread_by_user: true },
    });
  });
});
