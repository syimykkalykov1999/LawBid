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
  return { service, redis, published };
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
