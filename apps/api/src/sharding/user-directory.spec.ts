import type { PrismaService } from '../prisma/prisma.service';
import {
  USER_CARD_SELECT,
  UserDirectory,
  attachUsers,
  userCardCacheTtlSeconds,
  userDirectory,
} from './user-directory';

function setup() {
  const findMany = jest.fn(
    (args: { where: { id: { in: string[] } }; select: object }) =>
      Promise.resolve(
        args.where.id.in
          .filter((id) => id !== 'gone')
          .map((id) => {
            const all: Record<string, unknown> = {
              id,
              first_name: `N-${id}`,
              role: 'client',
            };
            return Object.fromEntries(
              Object.keys(args.select).map((k) => [k, all[k]]),
            );
          }),
      ),
  );
  const prisma = { user: { findMany } } as unknown as PrismaService;
  return { findMany, prisma, dir: new UserDirectory(prisma) };
}

describe('UserDirectory (shard-ready step 6)', () => {
  it('batches ids asked in the same tick, per projection, into one query', async () => {
    const { dir, findMany } = setup();
    const [a, b, c] = await Promise.all([
      dir.select(['u1', 'u2'], { first_name: true }),
      dir.select(['u2', 'u3'], { first_name: true }),
      dir.select(['u1'], { id: true, role: true }),
    ]);
    expect(findMany).toHaveBeenCalledTimes(2); // two projections
    const names = findMany.mock.calls.find((call) =>
      Object.prototype.hasOwnProperty.call(
        (call[0] as unknown as { select: object }).select,
        'first_name',
      ),
    )![0];
    expect([...names.where.id.in].sort()).toEqual(['u1', 'u2', 'u3']);
    expect(a.get('u1')).toEqual({ first_name: 'N-u1' }); // id not leaked
    expect(b.get('u3')).toEqual({ first_name: 'N-u3' });
    expect(c.get('u1')).toEqual({ id: 'u1', role: 'client' });
  });

  it('includes soft-deleted users (like a to-one include) and skips missing ids', async () => {
    const { dir, findMany } = setup();
    const m = await dir.select(['u1', 'gone', null, undefined], { id: true });
    expect([...m.keys()]).toEqual(['u1']);
    expect(
      (findMany.mock.calls[0][0] as unknown as { where: object }).where,
    ).toHaveProperty('deleted_at');
  });

  it('attachUsers stitches the same shape an include would give', async () => {
    const { prisma } = setup();
    const rows = await attachUsers(
      prisma,
      [
        { id: 'r1', client_id: 'u1' },
        { id: 'r2', client_id: 'gone' },
      ],
      'client_id',
      'client',
      { first_name: true },
    );
    expect(rows).toEqual([
      { id: 'r1', client_id: 'u1', client: { first_name: 'N-u1' } },
      // Step 9: a missing user is a ghost (selected fields null), not null.
      { id: 'r2', client_id: 'gone', client: { first_name: null } },
    ]);
  });

  it('cards() caches only the public card, with a TTL, and survives a Redis outage', async () => {
    const { dir, findMany } = setup();
    const store = new Map<string, string>();
    const redis = {
      mget: jest.fn((...args: (string | string[])[]) =>
        Promise.resolve(args.flat().map((k) => store.get(k) ?? null)),
      ),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
      del: jest.fn(() => Promise.resolve(1)),
    };
    dir.attachCache(redis as never, 10);
    await dir.cards(['u1']);
    await dir.cards(['u1']);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('u1'),
      expect.any(String),
      'EX',
      10,
    );
    const select = (findMany.mock.calls[0][0] as unknown as { select: object })
      .select;
    expect(select).toEqual(USER_CARD_SELECT);
    expect(JSON.stringify(select)).not.toMatch(/email|phone|password/);
    redis.mget.mockRejectedValueOnce(new Error('down'));
    expect((await dir.cards(['u1'])).get('u1')?.id).toBe('u1');
  });

  it('is off by default on one database, on (10 s) with several, env wins', () => {
    expect(userCardCacheTtlSeconds(1, {})).toBe(0);
    expect(userCardCacheTtlSeconds(2, {})).toBe(10);
    expect(
      userCardCacheTtlSeconds(2, { USER_DIRECTORY_CACHE_TTL_SECONDS: '0' }),
    ).toBe(0);
    expect(
      userCardCacheTtlSeconds(1, { USER_DIRECTORY_CACHE_TTL_SECONDS: '30' }),
    ).toBe(30);
  });

  it('userDirectory() is one instance per PrismaService', () => {
    const { prisma } = setup();
    expect(userDirectory(prisma)).toBe(userDirectory(prisma));
  });
});
