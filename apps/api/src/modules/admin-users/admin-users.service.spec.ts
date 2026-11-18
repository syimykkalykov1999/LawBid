import { AdminUsersService, parseUserQuery } from './admin-users.service';

describe('parseUserQuery (docs/06 §2.3 item 3)', () => {
  it('routes each shape to its index', () => {
    expect(parseUserQuery('')).toEqual({ kind: 'none' });
    expect(parseUserQuery('  ')).toEqual({ kind: 'none' });
    expect(parseUserQuery('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toEqual({
      kind: 'id',
      id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    });
    expect(parseUserQuery('@Jane_Doe')).toEqual({
      kind: 'username',
      usernameLower: 'jane_doe',
    });
    expect(parseUserQuery(' Jane@Example.com ')).toEqual({
      kind: 'email',
      email: 'jane@example.com',
    });
    expect(parseUserQuery('(212) 555-0199')).toEqual({
      kind: 'phone',
      e164: '+12125550199',
    });
    expect(parseUserQuery('1 212 555 0199')).toEqual({
      kind: 'phone',
      e164: '+12125550199',
    });
    expect(parseUserQuery('+44 20 7946 0958')).toEqual({
      kind: 'phone',
      e164: '+442079460958',
    });
    expect(parseUserQuery('Jane Doe')).toEqual({
      kind: 'name',
      needle: 'jane doe',
    });
    // Short digit runs are names/ids of something else, not phones.
    expect(parseUserQuery('12345')).toEqual({ kind: 'name', needle: '12345' });
  });
});

/**
 * Verify 17.11, batch 6 (A1): suspending an attorney also stops their
 * assistants at once — the same two steps as removing an assistant
 * (assistants.service remove / admin-teams removeMember): the context
 * cache is dropped and every session of the assistant ends.
 */
describe('AdminUsersService.suspend (an attorney with assistants)', () => {
  function setup(role: 'attorney' | 'client') {
    const tx = {
      user: { update: jest.fn().mockResolvedValue({}) },
      moderationAction: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: {
        // Verify batch 11 (B2): the target is read with the country scope.
        findFirst: jest.fn().mockResolvedValue({
          id: 'atty-1',
          role,
          status: 'active',
          deleted_at: null,
          suspended_reason: null,
        }),
      },
      assistantMembership: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { assistant_user_id: 'asst-1' },
            { assistant_user_id: 'asst-2' },
          ]),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const sessions = {
      revokeAllChainsForUser: jest.fn().mockResolvedValue(['c1']),
    };
    const context = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminUsersService(
      prisma as never,
      { record: jest.fn() } as never,
      sessions as never,
      { archiveOpenCasesOfClient: jest.fn().mockResolvedValue([]) } as never,
      {
        suspendInTx: jest.fn().mockResolvedValue({ withdrawnBids: 0 }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      context as never,
    );
    return { service, prisma, sessions, context };
  }
  const admin = { id: 'admin-1', ip: '127.0.0.1' } as never;

  it('drops the cache and ends the sessions of every active assistant', async () => {
    const { service, prisma, sessions, context } = setup('attorney');
    await service.suspend(admin, 'atty-1', 'fraud');
    expect(prisma.assistantMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attorney_id: 'atty-1',
          status: 'active',
        }) as unknown,
      }),
    );
    expect(context.invalidate).toHaveBeenCalledWith('asst-1');
    expect(context.invalidate).toHaveBeenCalledWith('asst-2');
    expect(sessions.revokeAllChainsForUser).toHaveBeenCalledWith(
      'asst-1',
      'assistant_removed',
    );
    expect(sessions.revokeAllChainsForUser).toHaveBeenCalledWith(
      'asst-2',
      'assistant_removed',
    );
  });

  it('a client has no team: nothing else is touched', async () => {
    const { service, prisma, context } = setup('client');
    await service.suspend(admin, 'atty-1', 'fraud');
    expect(prisma.assistantMembership.findMany).not.toHaveBeenCalled();
    expect(context.invalidate).not.toHaveBeenCalled();
  });
});
