import { MoveDbPool } from './move-db';
import { ShardMoveService } from './shard-move.service';

/**
 * 2026-11-08: the «Разделить базу» preview opened on «Масштаб» and
 * «Здоровье системы» counted half of every sharded table (COUNT(*) per
 * table: 1.6-2.0 s on a local 1M-user database, a full scan that grows with
 * the data). It must read one catalog estimate instead.
 */
describe('ShardMoveService.splitPlan', () => {
  function make(estimate: number) {
    const queries: string[] = [];
    const db = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve(
          /reltuples/.test(sql) ? [{ rows: estimate }] : [],
        );
      }),
      close: jest.fn(() => Promise.resolve()),
    };
    const pool = new MoveDbPool(
      { primary: 'postgresql://x/primary' },
      () => db as never,
    );
    const prisma = {
      global: () => ({
        shardMap: {
          findMany: jest.fn(() =>
            Promise.resolve(
              Array.from({ length: 256 }, (_, i) => ({ logical_shard: i })),
            ),
          ),
        },
      }),
    };
    const svc = new ShardMoveService(
      prisma as never,
      {} as never,
      undefined,
      pool,
    );
    return { svc, queries };
  }

  it('estimates the moving rows from pg_class, never COUNT(*)', async () => {
    const { svc, queries } = make(1_000_000);
    const plan = await svc.splitPlan('db1');
    expect(plan.shards).toHaveLength(128);
    expect(plan.rows).toBe(500_000); // half the shards → half the rows
    expect(queries).toHaveLength(1);
    expect(queries.join('\n')).not.toMatch(/count\(\*\)/i);
    expect(plan.readiness.ok).toBe(false); // db1 is not configured here
  });
});

/**
 * Owner 2026-11-12: «Авто» removes an extra database server only while it
 * holds no data at all. A data part, a move in flight or a single row keeps
 * it; a server that cannot be read is kept too.
 */
describe('ShardMoveService.emptyServers', () => {
  function make(o: {
    parts?: Record<string, number>;
    moves?: Record<string, number>;
    rows?: Record<string, boolean>;
    broken?: string;
  }) {
    const dbFor = (key: string) => ({
      query: jest.fn(() => {
        if (key === o.broken) return Promise.reject(new Error('down'));
        return Promise.resolve([{ any: o.rows?.[key] ?? false }]);
      }),
      close: jest.fn(() => Promise.resolve()),
    });
    const pool = new MoveDbPool(
      {
        primary: 'postgresql://x/primary',
        db1: 'postgresql://x/db1',
        db2: 'postgresql://x/db2',
        db3: 'postgresql://x/db3',
      },
      (key) => dbFor(key) as never,
    );
    const keyOf = (w: { physical_db?: string; OR?: unknown[] }): string =>
      w.physical_db ??
      ((w.OR?.[1] as { leftover_db: string }) ?? {}).leftover_db;
    const prisma = {
      global: () => ({
        shardMap: {
          count: jest.fn((a: { where: { physical_db: string } }) =>
            Promise.resolve(o.parts?.[a.where.physical_db] ?? 0),
          ),
        },
        shardMove: {
          count: jest.fn((a: { where: { OR: unknown[] } }) =>
            Promise.resolve(o.moves?.[keyOf(a.where)] ?? 0),
          ),
        },
      }),
    };
    return new ShardMoveService(prisma as never, {} as never, undefined, pool);
  }

  it('lists only servers with no part, no move and not one row', async () => {
    const svc = make({
      parts: { db1: 3 },
      moves: { db2: 1 },
      rows: { db3: false },
    });
    expect(await svc.emptyServers()).toEqual(['db3']);
  });

  it('a single row or an unreadable server keeps it', async () => {
    expect(
      await make({ rows: { db1: true }, broken: 'db2' }).emptyServers(),
    ).toEqual(['db3']);
  });
});
