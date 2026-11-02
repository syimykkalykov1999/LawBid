import type Redis from 'ioredis';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  SESSION_REVOKED_CHANNEL,
  parseSessionRevoked,
} from '../../../redis/session-revoked';
import { SessionRevocationService } from './session-revocation.service';
import type { TokenService } from './token.service';

/**
 * Owner 2026-10-22 (server load audit, finding 5): every way a session
 * ends goes through this service, and each one now publishes
 * `session:revoked` so live sockets close at once (RealtimeGateway).
 */
function setup(chains: string[] = ['c1', 'c2']) {
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    publish: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    session: {
      updateMany: jest.fn().mockResolvedValue({ count: chains.length }),
      findMany: jest
        .fn()
        .mockResolvedValue(chains.map((id) => ({ session_chain_id: id }))),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const service = new SessionRevocationService(
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
    { accessTtlSecondsValue: () => 900 } as unknown as TokenService,
  );
  const published = () =>
    redis.publish.mock.calls.map(([channel, raw]: [string, string]) => ({
      channel,
      msg: parseSessionRevoked(raw),
    }));
  return { service, redis, prisma, published };
}

describe('SessionRevocationService publishes session:revoked', () => {
  it('revokeChain (logout): blacklist, then one message', async () => {
    const { service, redis, published } = setup();
    await service.revokeChain('c9', 'logout');
    expect(redis.set).toHaveBeenCalledWith('authbl:c9', '1', 'EX', 960);
    expect(published()).toEqual([
      { channel: SESSION_REVOKED_CHANNEL, msg: { sessionId: 'c9' } },
    ]);
    // The blacklist is written before the message goes out: a socket that
    // reconnects right after the drop is refused at the handshake.
    expect(redis.set.mock.invocationCallOrder[0]).toBeLessThan(
      redis.publish.mock.invocationCallOrder[0],
    );
  });

  it('revokeAllChainsForUser (log out everywhere, block, deletion)', async () => {
    const { service, published } = setup(['c1', 'c2']);
    await service.revokeAllChainsForUser('u1', 'admin_block');
    expect(published()).toEqual([
      {
        channel: SESSION_REVOKED_CHANNEL,
        msg: { sessionId: 'c1', userId: 'u1' },
      },
      {
        channel: SESSION_REVOKED_CHANNEL,
        msg: { sessionId: 'c2', userId: 'u1' },
      },
    ]);
  });

  it('owner 2026-10-22 (audit #3): revokeOtherChainsForUser keeps the current session', async () => {
    const { service, prisma, redis, published } = setup(['c2']);
    const ended = await service.revokeOtherChainsForUser(
      'u1',
      'c1',
      'credentials_changed',
    );
    expect(ended).toEqual(['c2']);
    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: 'u1',
          revoked_at: null,
          session_chain_id: { not: 'c1' },
        },
      }),
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { session_chain_id: { in: ['c2'] }, revoked_at: null },
      data: {
        revoked_at: expect.any(Date),
        revoked_reason: 'credentials_changed',
      },
    });
    expect(redis.set).toHaveBeenCalledWith(
      'authbl:c2',
      'credentials_changed',
      'EX',
      960,
    );
    expect(published()).toEqual([
      {
        channel: SESSION_REVOKED_CHANNEL,
        msg: { sessionId: 'c2', userId: 'u1' },
      },
    ]);
  });

  it('revokeSameKindChains (signed in elsewhere)', async () => {
    const { service, published } = setup(['c3']);
    await service.revokeSameKindChains('u2', false, 'signed_in_elsewhere');
    expect(published()).toEqual([
      {
        channel: SESSION_REVOKED_CHANNEL,
        msg: { sessionId: 'c3', userId: 'u2' },
      },
    ]);
  });

  it('a failed publish never fails the revocation', async () => {
    const { service, redis } = setup();
    redis.publish.mockRejectedValueOnce(new Error('down'));
    await expect(service.revokeChain('c9', 'logout')).resolves.toBeUndefined();
  });
});

describe('parseSessionRevoked', () => {
  it('reads valid messages, rejects the rest', () => {
    expect(parseSessionRevoked('{"sessionId":"s","userId":"u"}')).toEqual({
      sessionId: 's',
      userId: 'u',
    });
    expect(parseSessionRevoked('{"sessionId":"s","userId":5}')).toEqual({
      sessionId: 's',
    });
    expect(parseSessionRevoked('{"userId":"u"}')).toBeNull();
    expect(parseSessionRevoked('{"sessionId":""}')).toBeNull();
    expect(parseSessionRevoked('null')).toBeNull();
    expect(parseSessionRevoked('{')).toBeNull();
  });
});

describe('SessionRevocationService.blacklistReason without Redis (load test 2026-11-02)', () => {
  const down = () => Promise.reject(new Error('Command timed out'));

  it('reads the newest row of the chain from the database: live chain → null, revoked → its reason, unknown → refused', async () => {
    const { service, redis, prisma } = setup();
    redis.get.mockImplementation(down);
    prisma.session.findFirst
      .mockResolvedValueOnce({ revoked_at: null, revoked_reason: null })
      .mockResolvedValueOnce({
        revoked_at: new Date(),
        revoked_reason: 'signed_in_elsewhere',
      })
      .mockResolvedValueOnce(null);
    await expect(service.blacklistReason('live')).resolves.toBeNull();
    await expect(service.blacklistReason('gone')).resolves.toBe(
      'signed_in_elsewhere',
    );
    await expect(service.blacklistReason('never')).resolves.toBe('1');
    expect(prisma.session.findFirst).toHaveBeenCalledWith({
      where: { session_chain_id: 'live' },
      orderBy: { created_at: 'desc' },
      select: { revoked_at: true, revoked_reason: true },
    });
    await expect(service.isBlacklisted('live')).resolves.toBe(false);
  });

  it('memoises the database verdict per chain for a few seconds', async () => {
    const { service, redis, prisma } = setup();
    redis.get.mockImplementation(down);
    prisma.session.findFirst.mockResolvedValue({
      revoked_at: null,
      revoked_reason: null,
    });
    for (let i = 0; i < 50; i += 1) await service.blacklistReason('c1');
    expect(prisma.session.findFirst).toHaveBeenCalledTimes(1);
  });

  it('with Redis healthy the database is never consulted', async () => {
    const { service, redis, prisma } = setup();
    redis.get.mockResolvedValue('logout');
    await expect(service.blacklistReason('c1')).resolves.toBe('logout');
    expect(prisma.session.findFirst).not.toHaveBeenCalled();
  });
});
