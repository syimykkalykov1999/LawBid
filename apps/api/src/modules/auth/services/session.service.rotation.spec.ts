import { SessionService } from './session.service';

/** S14-3 (2026-10-25): single-winner refresh rotation + the 10 s replay
 * cache of the child pair, instead of trusting a client device id. */
describe('SessionService.rotate (atomic, idempotent retry)', () => {
  const live = {
    id: 's1',
    user_id: 'u1',
    session_chain_id: 'chain',
    device_id: 'dev-A',
    device_name: null,
    platform: 'ios',
    app_version: null,
    ip: '1.1.1.1',
    user_agent: null,
    revoked_at: null,
    revoked_reason: null,
    expires_at: new Date(Date.now() + 86_400_000),
    updated_at: new Date(),
    user: { status: 'active', phone_e164: '+15551234567', email: 'a@b.co' },
  };

  function make(
    opts: {
      claimCount?: number;
      redisDown?: boolean;
      tokensDown?: boolean;
      banned?: boolean;
    } = {},
  ) {
    const store = new Map<string, string>();
    const redis = {
      get: jest.fn((k: string) =>
        opts.redisDown
          ? Promise.reject(new Error('down'))
          : Promise.resolve(store.get(k) ?? null),
      ),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    const child = {
      id: 's2',
      user_id: 'u1',
      session_chain_id: 'chain',
      revoked_at: null,
    };
    const tx = {
      session: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.claimCount ?? 1 }),
        create: jest.fn().mockResolvedValue(child),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      session: {
        findUnique: jest.fn((args: { where: Record<string, string> }) =>
          Promise.resolve(
            args.where.id === 's2'
              ? child
              : args.where.refresh_hash === 'hash-old'
                ? current.row
                : null,
          ),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      pushToken: {
        updateMany: jest.fn(() =>
          opts.tokensDown
            ? Promise.reject(new Error('down'))
            : Promise.resolve({ count: 1 }),
        ),
      },
      voipToken: {
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
    };
    const current: { row: Record<string, unknown> } = { row: live };
    const tokens = {
      hashRefreshToken: jest.fn(() => 'hash-old'),
      generateRefreshToken: jest.fn(() => ({
        raw: 'raw-new',
        hash: 'hash-new',
      })),
      refreshExpiryDate: jest.fn(() => new Date(Date.now() + 86_400_000)),
    };
    const revocation = { revokeChain: jest.fn().mockResolvedValue(undefined) };
    const authEvents = { record: jest.fn().mockResolvedValue(undefined) };
    const config = {
      getOrThrow: jest.fn((k: string) =>
        k === 'REFRESH_ROTATION_GRACE_SECONDS'
          ? 10
          : k === 'OTP_KEY_PEPPER'
            ? 'p'.repeat(40)
            : 30,
      ),
    };
    const rateLimit = {
      consumeFixedWindow: jest.fn().mockResolvedValue({ allowed: true }),
    };
    // Verify batch 7 (BA1): a phone / e-mail / device ban ends a live chain.
    const bans = {
      findActive: jest.fn(() =>
        Promise.resolve(opts.banned ? { id: 'b1', kind: 'phone' } : null),
      ),
    };
    const service = new SessionService(
      prisma as never,
      tokens as never,
      revocation as never,
      authEvents as never,
      config as never,
      rateLimit as never,
      redis as never,
      bans as never,
    );
    return { service, tx, prisma, redis, revocation, current, store, bans };
  }

  it('BA1: an active phone / e-mail / device ban refuses the refresh as a suspended account, chain revoked', async () => {
    const { service, tx, revocation, bans } = make({ banned: true });
    const out = await service.rotate('raw-old', { deviceId: 'x' }, {});
    expect(out).toEqual({ status: 'blocked', reason: 'suspended' });
    expect(bans.findActive).toHaveBeenCalledWith({
      userId: 'u1',
      phone: '+15551234567',
      email: 'a@b.co',
      deviceId: 'dev-A',
    });
    expect(revocation.revokeChain).toHaveBeenCalledWith(
      'chain',
      'admin_block',
      expect.anything(),
    );
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it('the winner claims the row with a revoked_at:null guard, mints the child and caches it', async () => {
    const { service, tx, store } = make();
    const out = await service.rotate('raw-old', { deviceId: 'x' }, {});
    expect(out).toMatchObject({ status: 'ok', refreshTokenRaw: 'raw-new' });
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', revoked_at: null },
      data: expect.objectContaining({ revoked_reason: 'rotated' }),
    });
    expect(store.has('auth:refresh-replay:hash-old')).toBe(true);
    // The cached pair is encrypted, never the raw token.
    expect([...store.values()][0]).not.toContain('raw-new');
  });

  // 14.11 (DB scale review, finding 8): the device's push and VoIP tokens
  // move to the new row, so the nightly clean-up of the old row (ON DELETE
  // CASCADE) never takes the token of a device that is still signed in.
  it('moves the device push and VoIP tokens to the new row of the chain', async () => {
    const { service, prisma } = make();
    await service.rotate('raw-old', { deviceId: 'x' }, {});
    const move = {
      where: {
        user_id: 'u1',
        OR: [{ session_chain_id: 'chain' }, { session_id: 's1' }],
      },
      data: { session_id: 's2', session_chain_id: 'chain' },
    };
    expect(prisma.pushToken.updateMany).toHaveBeenCalledWith(move);
    expect(prisma.voipToken.updateMany).toHaveBeenCalledWith(move);
  });

  it('a failed token move never fails the refresh', async () => {
    const { service } = make({ tokensDown: true });
    await expect(
      service.rotate('raw-old', { deviceId: 'x' }, {}),
    ).resolves.toMatchObject({ status: 'ok' });
  });

  it('a lost race moves nothing', async () => {
    const { service, prisma } = make({ claimCount: 0 });
    await service.rotate('raw-old', { deviceId: 'x' }, {});
    expect(prisma.pushToken.updateMany).not.toHaveBeenCalled();
  });

  it('the chain keeps the device it was created on (a refresh cannot re-label it)', async () => {
    const { service, tx } = make();
    await service.rotate('raw-old', { deviceId: 'attacker' }, {});
    expect(tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ device_id: 'dev-A' }),
    });
  });

  it('the loser of the race gets the winner’s pair, never a second child', async () => {
    const winner = make();
    await winner.service.rotate('raw-old', {}, {});
    const loser = make({ claimCount: 0 });
    // share the cache the winner filled
    for (const [k, v] of winner.store) loser.store.set(k, v);
    const out = await loser.service.rotate('raw-old', {}, {});
    expect(out).toMatchObject({ status: 'ok', refreshTokenRaw: 'raw-new' });
    expect(loser.tx.session.create).not.toHaveBeenCalled();
  });

  it('a retry of an already-rotated token inside the window is replayed, not reuse', async () => {
    const first = make();
    await first.service.rotate('raw-old', {}, {});
    const retry = make();
    for (const [k, v] of first.store) retry.store.set(k, v);
    retry.current.row = {
      ...live,
      revoked_at: new Date(),
      revoked_reason: 'rotated',
    };
    const out = await retry.service.rotate(
      'raw-old',
      { deviceId: 'other' },
      {},
    );
    expect(out).toMatchObject({ status: 'ok', refreshTokenRaw: 'raw-new' });
    expect(retry.revocation.revokeChain).not.toHaveBeenCalled();
  });

  it('after the window (cache gone) a replay of the old token is reuse: the chain is revoked', async () => {
    const { service, current, revocation } = make();
    current.row = {
      ...live,
      revoked_at: new Date(Date.now() - 60_000),
      revoked_reason: 'rotated',
      updated_at: new Date(Date.now() - 60_000),
    };
    const out = await service.rotate('raw-old', { deviceId: 'dev-A' }, {});
    expect(out.status).toBe('reuse_detected');
    expect(revocation.revokeChain).toHaveBeenCalled();
  });

  it('Redis down inside the grace window: retryable busy (503 upstream), the chain is NOT ended', async () => {
    const { service, current, revocation } = make({ redisDown: true });
    current.row = {
      ...live,
      revoked_at: new Date(),
      revoked_reason: 'rotated',
      updated_at: new Date(),
    };
    const out = await service.rotate('raw-old', {}, {});
    expect(out).toEqual({ status: 'busy', retryAfterSeconds: 2 });
    expect(revocation.revokeChain).not.toHaveBeenCalled();
  });

  it('replay-cache miss inside the grace window: busy, never invalid and never reuse', async () => {
    const { service, current, revocation } = make();
    current.row = {
      ...live,
      revoked_at: new Date(),
      revoked_reason: 'rotated',
      updated_at: new Date(),
    };
    const out = await service.rotate('raw-old', {}, {});
    expect(out).toEqual({ status: 'busy', retryAfterSeconds: 2 });
    expect(revocation.revokeChain).not.toHaveBeenCalled();
  });

  it('Redis down after the grace window is still reuse (the chain ends)', async () => {
    const { service, current, revocation } = make({ redisDown: true });
    current.row = {
      ...live,
      revoked_at: new Date(Date.now() - 60_000),
      revoked_reason: 'rotated',
      updated_at: new Date(Date.now() - 60_000),
    };
    const out = await service.rotate('raw-old', {}, {});
    expect(out.status).toBe('reuse_detected');
    expect(revocation.revokeChain).toHaveBeenCalled();
  });

  it('a lost race whose winner never cached its pair answers busy, not invalid (no sign-out)', async () => {
    const loser = make({ claimCount: 0 });
    const out = await loser.service.rotate('raw-old', {}, {});
    expect(out).toEqual({ status: 'busy', retryAfterSeconds: 2 });
    expect(loser.tx.session.create).not.toHaveBeenCalled();
  });
});
