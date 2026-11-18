import { SessionService } from './session.service';

/** SE1 (17.11): two phone sign-ins of one account at the same moment must
 * not both keep a session (one phone + one website per account). Ending the
 * other same-kind sessions and creating the new one run in one transaction
 * behind a per-account advisory lock, so the second sign-in sees and ends
 * the first one's row. */
describe('SessionService.createSession (one per kind, atomic)', () => {
  function make() {
    const order: string[] = [];
    const tx = {
      $executeRaw: jest.fn((_sql: TemplateStringsArray, ...values) => {
        order.push(`lock:${String(values[0])}`);
        return Promise.resolve(1);
      }),
      session: {
        create: jest.fn(() => {
          order.push('create');
          return Promise.resolve({ id: 's-new', session_chain_id: 'c-new' });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      session: {
        create: jest.fn(() => {
          order.push('create-outside');
          return Promise.resolve({ id: 's-new', session_chain_id: 'c-new' });
        }),
      },
      pushToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const revocation = {
      revokeSameKindChains: jest.fn((...args: unknown[]) => {
        order.push(args[3] === tx ? 'revoke-in-tx' : 'revoke-outside');
        return Promise.resolve(['c-old']);
      }),
    };
    const tokenService = {
      generateRefreshToken: () => ({ raw: 'raw', hash: 'hash' }),
      refreshExpiryDate: () => new Date('2100-01-01'),
    };
    const service = new SessionService(
      prisma as never,
      tokenService as never,
      revocation as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, order, prisma };
  }

  it('locks the account, ends the other phone session and creates the new one in ONE transaction', async () => {
    const { service, order, prisma } = make();
    const out = await service.createSession(
      'u1',
      { deviceId: 'd2', platform: 'android' },
      {},
    );
    expect(out.refreshTokenRaw).toBe('raw');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      'lock:session-kind:u1:app',
      'revoke-in-tx',
      'create',
    ]);
    // Push tokens of the ended phone session still go.
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('a website sign-in takes the website lock (it never ends the phone)', async () => {
    const { service, order } = make();
    await service.createSession('u1', { deviceId: 'w1', platform: 'web' }, {});
    expect(order[0]).toBe('lock:session-kind:u1:web');
  });
});
