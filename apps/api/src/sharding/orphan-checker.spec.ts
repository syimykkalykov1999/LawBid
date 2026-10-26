/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method -- fakes */
import type { MoveDb } from './move/move-db';
import type { CrossFamilyEdge } from './move/move-plan';
import { OrphanChecker } from './orphan-checker';

/** Every SQL the fakes saw (index-friendliness checks). */
const sqls: string[] = [];

/** A fake database: tables as lists of column values. */
function fakeDb(
  key: string,
  data: Record<string, Record<string, string[]>>,
): MoveDb {
  return {
    key,
    async query(sql: string, params: unknown[] = []) {
      sqls.push(sql);
      const typ = /format_type/.exec(sql);
      if (typ) {
        const tbl = /"(\w+)"/.exec(params[0] as string)?.[1] ?? '';
        return data[tbl]?.[params[1] as string] ? [{ t: 'uuid' }] : [];
      }
      const distinct = /SELECT DISTINCT "(\w+)" FROM "(\w+)"/.exec(sql);
      if (distinct) {
        const [, col, tbl] = distinct;
        const hasCursor = params.length > 1;
        const vals = [...new Set(data[tbl]?.[col] ?? [])]
          .sort()
          .filter((v) => !hasCursor || v > (params[1] as string))
          .slice(0, params[0] as number);
        return vals.map((v) => ({ v }));
      }
      const parent = /SELECT "(\w+)"::text AS v FROM "(\w+)"/.exec(sql);
      if (parent) {
        const ids = new Set(params[0] as string[]);
        return (data[parent[2]]?.[parent[1]] ?? [])
          .filter((v) => ids.has(v))
          .map((v) => ({ v }));
      }
      throw new Error(`unexpected sql ${sql}`);
    },
    async tx() {
      throw new Error('no tx');
    },
    async close() {},
  } as MoveDb;
}

const edge = (over: Partial<CrossFamilyEdge>): CrossFamilyEdge => ({
  childModel: 'Notification',
  childTable: 'notifications',
  column: 'user_id',
  parentModel: 'User',
  parentTable: 'users',
  parentColumn: 'id',
  required: true,
  ...over,
});

describe('OrphanChecker', () => {
  const o = { pageSize: 2, maxValuesPerEdge: 100 };

  it('finds a child whose global parent is gone, on a non-primary database', async () => {
    const primary = fakeDb('primary', { users: { id: ['u1', 'u2'] } });
    const db1 = fakeDb('db1', {
      notifications: { user_id: ['u1', 'u2', 'u2', 'ghost', 'ghost2'] },
    });
    const r = await new OrphanChecker(undefined, undefined).check(
      [primary, db1],
      [edge({})],
      o,
    );
    expect(r.totalOrphans).toBe(2);
    expect(r.edges.find((e) => e.database === 'db1')).toMatchObject({
      checked: 4,
      orphans: 2,
      sample: ['ghost', 'ghost2'],
    });
  });

  it('a sharded parent may live on any database', async () => {
    const primary = fakeDb('primary', { cases: { id: [] } });
    const db1 = fakeDb('db1', { cases: { id: ['c1'] } });
    const r = await new OrphanChecker(undefined, undefined).check(
      [primary, db1],
      [
        edge({
          childModel: 'Report',
          childTable: 'reports',
          column: 'case_id',
          parentModel: 'Case',
          parentTable: 'cases',
        }),
      ],
      o,
    );
    // reports is global: checked on primary only; c1 exists on db1.
    primary.query = fakeDb('primary', {
      cases: { id: [] },
      reports: { case_id: ['c1', 'c9'] },
    }).query;
    const r2 = await new OrphanChecker(undefined, undefined).check(
      [primary, db1],
      [
        edge({
          childModel: 'Report',
          childTable: 'reports',
          column: 'case_id',
          parentModel: 'Case',
          parentTable: 'cases',
        }),
      ],
      o,
    );
    expect(r.totalOrphans).toBe(0);
    expect(r2.edges).toHaveLength(1);
    expect(r2.totalOrphans).toBeGreaterThanOrEqual(1);
  });

  it('reports no orphans on a clean database', async () => {
    const primary = fakeDb('primary', {
      users: { id: ['u1'] },
      notifications: { user_id: ['u1'] },
    });
    const r = await new OrphanChecker(undefined, undefined).check(
      [primary],
      [edge({})],
      o,
    );
    expect(r.totalOrphans).toBe(0);
  });

  it('stops at the per-edge cap and says so', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `u${i}`);
    const primary = fakeDb('primary', {
      users: { id: ids },
      notifications: { user_id: ids },
    });
    const r = await new OrphanChecker(undefined, undefined).check(
      [primary],
      [edge({})],
      {
        pageSize: 2,
        maxValuesPerEdge: 4,
      },
    );
    expect(r.edges[0].truncated).toBe(true);
    expect(r.edges[0].checked).toBe(4);
  });
  it('compares in the column type, never casts the column (index range scan)', async () => {
    sqls.length = 0;
    const primary = fakeDb('primary', { users: { id: ['u1', 'u2', 'u3'] } });
    const db1 = fakeDb('db1', {
      notifications: { user_id: ['u1', 'u2', 'u3'] },
    });
    await new OrphanChecker(undefined, undefined).check(
      [primary, db1],
      [edge({})],
      o,
    );
    const all = sqls.join('\n');
    expect(all).toContain('"user_id" > $2::uuid');
    expect(all).toContain('"id" = ANY($1::uuid[])');
    expect(all).not.toMatch(/"user_id"::text >/);
    expect(all).not.toMatch(/"id"::text = ANY/);
    expect(all).not.toMatch(/ORDER BY v\b/);
  });
});
