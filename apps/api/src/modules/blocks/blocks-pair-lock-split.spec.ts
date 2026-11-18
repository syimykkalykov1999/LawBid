import { randomUUID } from 'node:crypto';
import { ROUTING } from '../../prisma/prisma.service';
import { shardContext } from '../../sharding/shard-context';
import { hashShard } from '../../sharding/shard-id';
import { FollowsService } from '../follows/follows.service';
import { BlocksService } from './blocks.service';

/**
 * KNOWN_ERRORS 215 (BL1 across databases): with several physical databases
 * `Follow` lives with the follower and `UserBlock` with the blocker, so the
 * per-pair lock is taken on the PRIMARY database (`global()`) and held while
 * every read and write runs in the database of its row's owner.
 */
describe('BL1 per-pair lock with several databases', () => {
  const me = randomUUID();
  const other = randomUUID();

  function make(opts: { blocked?: { blocker: string } } = {}) {
    const events: string[] = [];
    const where = () => {
      const c = shardContext.current();
      return c?.source === 'user' ? `shard ${c.shard}` : 'no shard';
    };
    const lockTx = {
      $executeRaw: jest.fn((parts: TemplateStringsArray, key: string) => {
        events.push(
          `lock ${parts.join('?').includes('pg_advisory_xact_lock') ? key : '?'}`,
        );
        return Promise.resolve(1);
      }),
    };
    const lockClient = {
      $transaction: jest.fn(
        async (
          fn: (t: typeof lockTx) => unknown,
          o?: { isolationLevel?: string },
        ) => {
          events.push(`begin ${o?.isolationLevel}`);
          const r = await fn(lockTx);
          events.push('commit');
          return r;
        },
      ),
    };
    const prisma = {
      [ROUTING]: { shardDatabaseKeys: () => ['db1'] },
      global: jest.fn(() => lockClient),
      $transaction: jest.fn(() => {
        throw new Error('no transaction on a shard database');
      }),
      user: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: other,
            role: 'attorney',
            status: 'active',
            attorney_profile: { verification_status: 'verified' },
          }),
        ),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      userBlock: {
        createMany: jest.fn((a: { data: { blocker_id: string }[] }) => {
          events.push(`block by ${a.data[0].blocker_id} on ${where()}`);
          return Promise.resolve({ count: 1 });
        }),
        findFirst: jest.fn((a: { where: { blocker_id: string } }) => {
          events.push(`check ${a.where.blocker_id} on ${where()}`);
          return Promise.resolve(
            opts.blocked?.blocker === a.where.blocker_id
              ? { blocker_id: a.where.blocker_id }
              : null,
          );
        }),
      },
      follow: {
        createMany: jest.fn((a: { data: { follower_id: string }[] }) => {
          events.push(`follow by ${a.data[0].follower_id} on ${where()}`);
          return Promise.resolve({ count: 1 });
        }),
        deleteMany: jest.fn((a: { where: { follower_id: string } }) => {
          events.push(`unfollow by ${a.where.follower_id} on ${where()}`);
          return Promise.resolve({ count: 1 });
        }),
      },
      followTombstone: { deleteMany: jest.fn(() => Promise.resolve({})) },
      attorneyProfile: {
        findUnique: jest.fn(() => Promise.resolve({ followers_count: 1 })),
      },
    };
    const redis = {
      set: jest.fn(() => Promise.resolve('OK')),
      del: jest.fn(() => Promise.resolve(1)),
    };
    const counters = {
      bump: jest.fn(),
      pending: jest.fn(() => Promise.resolve(new Map())),
    };
    const blocks = new BlocksService(
      prisma as never,
      {} as never,
      counters as never,
      redis as never,
      undefined,
    );
    const follows = new FollowsService(
      prisma as never,
      { consume: jest.fn() } as never,
      counters as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      // The check before the lock saw no block yet.
      { assertNotBlocked: jest.fn() } as never,
      redis as never,
    );
    return { blocks, follows, events, prisma, counters };
  }
  const key =
    me < other ? `block-pair:${me}:${other}` : `block-pair:${other}:${me}`;
  const on = (id: string) => `shard ${hashShard(id)}`;

  it('follow: lock on the primary first, re-check each blocker in its database, insert in the follower’s', async () => {
    const { follows, events, prisma } = make();
    await follows.follow({ sub: me, role: 'client' } as never, other);
    expect(prisma.global).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events).toEqual([
      'begin ReadCommitted',
      `lock ${key}`,
      `check ${me} on ${on(me)}`,
      `check ${other} on ${on(other)}`,
      `follow by ${me} on ${on(me)}`,
      'commit',
    ]);
  });

  it('follow: a block found in the blocker’s database under the lock refuses it', async () => {
    const { follows, events } = make({ blocked: { blocker: other } });
    await expect(
      follows.follow({ sub: me, role: 'client' } as never, other),
    ).rejects.toMatchObject({ response: { code: 'USER_BLOCKED' } });
    expect(events.some((e) => e.startsWith('follow by'))).toBe(false);
  });

  it('block: lock on the primary first, block in the blocker’s database, follows removed both ways in each follower’s', async () => {
    const { blocks, events, counters } = make();
    await blocks.block(me, other);
    expect(events).toEqual([
      'begin ReadCommitted',
      `lock ${key}`,
      `block by ${me} on ${on(me)}`,
      `unfollow by ${me} on ${on(me)}`,
      `unfollow by ${other} on ${on(other)}`,
      'commit',
    ]);
    // Both removed follows leave both counters, as before.
    expect(counters.bump).toHaveBeenCalledTimes(4);
  });
});
