import { CATCH_UP_MAX, GroupsService } from './groups.service';

/** Owner 2026-10-22 (client economy plan, package B): group list deltas,
 * `afterId` catch-up, the card inside `group:update`. */
describe('GroupsService deltas', () => {
  const since = new Date('2026-10-22T10:00:00Z');
  const t = (m: number) => new Date(since.getTime() + m * 60_000);
  const group = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    deleted_at: null,
    last_message_at: t(1),
    updated_at: t(1),
    title: id,
    description: null,
    avatar_file_id: null,
    member_count: 3,
    group_type: 'closed',
    username: null,
    join_approval: false,
    topics_enabled: false,
    general_topic_id: null,
    who_can_post: 'all',
    who_can_add: 'all',
    who_can_edit_info: 'admins',
    who_can_call: 'all',
    who_can_media: 'all',
    who_can_poll: 'all',
    who_can_pin: 'admins',
    show_service_messages: true,
    disappear_after_s: null,
    protect_content: false,
    ...over,
  });
  const member = (
    g: ReturnType<typeof group>,
    over: Record<string, unknown> = {},
  ) => ({
    group_id: g.id,
    user_id: 'me',
    left_at: null,
    hidden_at: null,
    archived_at: null,
    updated_at: t(0),
    role: 'member',
    group: g,
    ...over,
  });

  function setup(opts: { members?: unknown[]; messages?: unknown[] } = {}) {
    const prisma = {
      chatGroupMember: {
        findMany: jest.fn().mockResolvedValue(opts.members ?? []),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      chatGroupMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a', created_at: t(0) }),
        findMany: jest.fn().mockResolvedValue(opts.messages ?? []),
      },
      chatGroup: {
        findFirst: jest
          .fn()
          .mockResolvedValue(group('g1', { avatar_file_id: 'f' })),
      },
    };
    const presenter = {
      groups: jest.fn((rows: { group: { id: string } }[]) =>
        Promise.resolve(rows.map((r) => ({ id: r.group.id }))),
      ),
      messages: jest.fn((rows: { id: string }[]) =>
        Promise.resolve(rows.map((r) => ({ id: r.id }))),
      ),
    };
    const files = {
      avatarUrlsMany: jest
        .fn()
        .mockResolvedValue(new Map([['f', { url256: 's', url: 'l' }]])),
    };
    const toUsers = jest.fn();
    const svc = new GroupsService(
      prisma as never,
      files as never,
      { toUsers } as never,
      {} as never,
      {} as never,
      {} as never,
      presenter as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { svc, prisma, presenter, toUsers };
  }
  const me = { sub: 'me', role: 'client' } as never;

  it('updatedSince: changed groups as rows, the ones I left / archived as deletedIds, syncedAt = newest stamp', async () => {
    const g1 = group('g1', { updated_at: t(5) });
    const g2 = group('g2');
    const g3 = group('g3');
    const g4 = group('g4', { deleted_at: t(2), updated_at: t(2) });
    const { svc } = setup({
      members: [
        member(g1),
        member(g2, { left_at: t(3), updated_at: t(3) }),
        member(g3, { archived_at: t(4), updated_at: t(4) }),
        member(g4),
      ],
    });
    const page = await svc.list(me, undefined, false, since.toISOString());
    expect(page.items.map((g) => g.id)).toEqual(['g1']);
    expect(page.deletedIds).toEqual(['g2', 'g3', 'g4']);
    expect(page.syncedAt).toBe(t(5).toISOString());
    expect(page.nextCursor).toBeNull();
  });

  it('updatedSince older than 7 days is 409 SYNC_TOO_OLD', async () => {
    const { svc } = setup();
    await expect(
      svc.list(me, undefined, false, '2020-01-01T00:00:00Z'),
    ).rejects.toMatchObject({ response: { code: 'SYNC_TOO_OLD' } });
  });

  it('afterId: oldest first, up to the cap; beyond it 409', async () => {
    const rows = Array.from({ length: CATCH_UP_MAX }, (_, i) => ({
      id: `m${i}`,
    }));
    const { svc, prisma } = setup({ messages: rows });
    jest
      .spyOn(svc as never, 'requireMember' as never)
      .mockResolvedValue({ group: group('g1') } as never);
    const page = await svc.messagesAfter(me, 'g1', 'a');
    expect(page.items).toHaveLength(CATCH_UP_MAX);
    expect(prisma.chatGroupMessage.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: CATCH_UP_MAX + 1,
    });
    prisma.chatGroupMessage.findMany.mockResolvedValue([...rows, { id: 'x' }]);
    await expect(svc.messagesAfter(me, 'g1', 'a')).rejects.toMatchObject({
      response: { code: 'SYNC_TOO_OLD' },
    });
  });

  it('group:update carries the shared card for a card change, not for an invite', async () => {
    const { svc, toUsers } = setup({
      members: [{ user_id: 'u1' }, { user_id: 'u2' }],
    });
    await svc.groupChanged('g1', 'info');
    expect(toUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'group:update',
      expect.objectContaining({
        groupId: 'g1',
        kind: 'info',
        card: expect.objectContaining({
          id: 'g1',
          title: 'g1',
          avatarUrl: 's',
          memberCount: 3,
        }),
      }),
    );
    toUsers.mockClear();
    await svc.groupChanged('g1', 'invites');
    expect(toUsers.mock.calls[0][2]).toEqual({
      groupId: 'g1',
      kind: 'invites',
    });
  });
});
