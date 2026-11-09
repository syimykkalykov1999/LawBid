import {
  inflateStatisticsSql,
  judgeCost,
  paramLiterals,
  planCost,
  seqScans,
  type PlanNode,
} from './query-plan-judge';

describe('query-plan-judge (user-facing perf guard)', () => {
  const big = new Set(['messages', 'posts']);

  it('flags a sequential scan of a big table anywhere in the plan', () => {
    const plan: PlanNode = {
      'Node Type': 'Limit',
      'Total Cost': 10,
      Plans: [
        {
          'Node Type': 'Nested Loop',
          Plans: [
            {
              'Node Type': 'Seq Scan',
              'Relation Name': 'states',
              'Plan Rows': 50,
            },
            {
              'Node Type': 'Seq Scan',
              'Relation Name': 'messages',
              'Plan Rows': 1e8,
            },
          ],
        },
      ],
    };
    expect(seqScans(plan, big)).toEqual([
      'Seq Scan on messages (~100000000 rows)',
    ]);
    expect(planCost(plan)).toBe(10);
  });

  it('a bounded page passes; a cost that grows with the data fails', () => {
    // the same 80k at 10M and 100M rows: bounded (500 rows x two lookups)
    expect(
      judgeCost(
        new Map([
          [100, 80_000],
          [1000, 81_000],
        ]),
        100_000,
        1e6,
      ),
    ).toEqual([]);
    expect(
      judgeCost(
        new Map([
          [100, 90_000],
          [1000, 120_000],
        ]),
        100_000,
        1e6,
      ),
    ).toEqual([]);
    // ten times the rows, ten times the cost: reads a share of a table
    expect(
      judgeCost(
        new Map([
          [100, 50_000],
          [1000, 480_000],
        ]),
        100_000,
        1e6,
      ),
    ).toEqual(['plan cost grows with the data: 50000 @×100 -> 480000 @×1000']);
    // too dear at any size
    expect(
      judgeCost(
        new Map([
          [100, 2e6],
          [1000, 2e6],
        ]),
        100_000,
        1e6,
      ),
    ).toEqual(['plan cost 2000000 > 1000000']);
    expect(judgeCost(new Map([[100, 2e5]]), 100_000, 1e6)).toEqual([
      'plan cost 200000 > 100000',
    ]);
  });

  it('inflates tables, their indexes and id-like distinct counts', () => {
    const sql = inflateStatisticsSql(100);
    expect(sql).toHaveLength(3);
    expect(sql.join('\n')).toContain('reltuples * 100');
    expect(sql[1]).toContain('stadistinct * 100');
    expect(() => inflateStatisticsSql(0)).toThrow();
  });

  it('turns Prisma params into typed-by-context literals', () => {
    expect(paramLiterals('[]')).toBe('');
    expect(paramLiterals('["a\'b",20,true,null]')).toBe(
      "'a''b', '20', 'true', NULL",
    );
    expect(paramLiterals('[["x","y"],{"k":1}]')).toBe(`'{"x","y"}', '{"k":1}'`);
    expect(paramLiterals('[2026-11-08 10:00:00 UTC,5]')).toBe(
      "'2026-11-08 10:00:00 UTC', '5'",
    );
  });
});
