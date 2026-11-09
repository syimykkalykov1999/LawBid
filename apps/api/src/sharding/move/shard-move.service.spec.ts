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
