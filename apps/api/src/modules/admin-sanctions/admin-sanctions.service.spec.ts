import { ConflictException } from '@nestjs/common';
import { AdminSanctionsService } from './admin-sanctions.service';

/**
 * Verify batch 7 (2026-11-17):
 * BA1 a phone / e-mail / device ban ends the live sessions it matches;
 * BA2 a lasting user ban disables the account (it disappears, as a
 *     disabled Instagram / Facebook account does) and lifting it restores it;
 * BA3 lifting is one conditional update (two admins: one wins, one 409).
 */
describe('AdminSanctionsService (verify batch 7)', () => {
  const admin = { id: 'adm', ip: '1.1.1.1' } as never;
  const uid = '11111111-1111-4111-8111-111111111111';

  function make(
    opts: {
      ban?: Record<string, unknown>;
      liftCount?: number;
      otherUserBan?: boolean;
    } = {},
  ) {
    const ban = {
      id: 'b1',
      kind: 'user',
      value: uid,
      user_id: uid,
      reason: 'r',
      expires_at: null,
      created_at: new Date(),
      created_by: 'adm',
      lifted_at: null,
      lift_reason: null,
      ...opts.ban,
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: unknown) => unknown): unknown =>
        fn(prisma),
      ),
      accountBan: {
        create: jest.fn(
          (a: { data: Record<string, unknown> }): Promise<unknown> =>
            Promise.resolve({ ...ban, ...a.data, id: 'b1' }),
        ),
        findUnique: jest.fn(() => Promise.resolve(ban)),
        findFirst: jest.fn(() =>
          Promise.resolve(opts.otherUserBan ? { id: 'b2' } : null),
        ),
        update: jest.fn(() =>
          Promise.resolve({ ...ban, lifted_at: new Date() }),
        ),
        updateMany: jest.fn(() =>
          Promise.resolve({ count: opts.liftCount ?? 1 }),
        ),
      },
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: uid,
            role: 'attorney',
            status: 'active',
            phone_e164: null,
            email: null,
            admin_profile: null,
          }),
        ),
        findMany: jest.fn(() => Promise.resolve([{ id: 'u-phone' }])),
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
      session: {
        findMany: jest.fn(() =>
          Promise.resolve([{ session_chain_id: 'chain-d' }]),
        ),
      },
    };
    const audit = { record: jest.fn(() => Promise.resolve(undefined)) };
    const revocation = {
      revokeAllChainsForUser: jest.fn(() => Promise.resolve(['c'])),
      revokeChain: jest.fn(() => Promise.resolve(undefined)),
    };
    const svc = new AdminSanctionsService(
      prisma as never,
      audit as never,
      revocation as never,
    );
    return { svc, prisma, revocation };
  }

  it('BA1: a phone ban ends the sessions of the account with that phone', async () => {
    const { svc, prisma, revocation } = make({ ban: { kind: 'phone' } });
    await svc.create(admin, {
      kind: 'phone',
      value: '+15551234567',
      reason: 'spam',
    } as never);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone_e164: '+15551234567' } }),
    );
    expect(revocation.revokeAllChainsForUser).toHaveBeenCalledWith(
      'u-phone',
      'admin_block',
    );
  });

  it('BA1: an e-mail ban ends the sessions of the account with that e-mail', async () => {
    const { svc, prisma, revocation } = make({ ban: { kind: 'email' } });
    await svc.create(admin, {
      kind: 'email',
      value: 'Spam@Example.com',
      reason: 'spam',
    } as never);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'spam@example.com' },
      }),
    );
    expect(revocation.revokeAllChainsForUser).toHaveBeenCalledWith(
      'u-phone',
      'admin_block',
    );
  });

  it('BA1: a device ban ends the live chains signed in on that device', async () => {
    const { svc, prisma, revocation } = make({ ban: { kind: 'device' } });
    await svc.create(admin, {
      kind: 'device',
      value: 'dev-123',
      reason: 'spam',
    } as never);
    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { device_id: 'dev-123', revoked_at: null },
      }),
    );
    expect(revocation.revokeChain).toHaveBeenCalledWith(
      'chain-d',
      'admin_block',
    );
  });

  it('BA2: a lasting user ban disables an active account (conditional update)', async () => {
    const { svc, prisma } = make();
    await svc.create(admin, { kind: 'user', value: uid, reason: 'r' } as never);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: uid, status: 'active' },
      data: { status: 'suspended', suspended_reason: 'account_ban' },
    });
  });

  it('BA2: a timed user ban leaves the status alone (it ends by itself, no job)', async () => {
    const { svc, prisma } = make({
      ban: { expires_at: new Date(Date.now() + 1e9) },
    });
    await svc.create(admin, {
      kind: 'user',
      value: uid,
      reason: 'r',
      days: 7,
    } as never);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('BA2: lifting the last user ban restores only a ban-suspended account', async () => {
    const { svc, prisma } = make();
    await svc.lift(admin, 'b1', 'ok');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: uid, status: 'suspended', suspended_reason: 'account_ban' },
      data: { status: 'active', suspended_reason: null },
    });
  });

  it('BA2: another active user ban keeps the account disabled', async () => {
    const { svc, prisma } = make({ otherUserBan: true });
    await svc.lift(admin, 'b1', 'ok');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('BA3: lift is one conditional update; a lost race is 409', async () => {
    const { svc, prisma } = make({ liftCount: 0 });
    await expect(svc.lift(admin, 'b1', 'ok')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.accountBan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1', lifted_at: null } }),
    );
  });
});
