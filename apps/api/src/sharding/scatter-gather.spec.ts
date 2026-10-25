import { canScatter, mergeScatter, perDatabaseArgs } from './scatter-gather';

describe('scatter-gather merge (shard-ready step 8)', () => {
  it('sums counts and update/delete counts', () => {
    expect(mergeScatter('count', {}, [2, 3])).toBe(5);
    expect(
      mergeScatter('updateMany', {}, [{ count: 1 }, { count: 4 }]),
    ).toEqual({ count: 5 });
  });

  it('findMany: merges, re-sorts (nulls like PostgreSQL) and re-applies skip/take', () => {
    const a = [{ n: 1 }, { n: 4 }, { n: null }];
    const b = [{ n: 2 }, { n: 3 }];
    const args = { orderBy: { n: 'asc' }, skip: 1, take: 3 };
    expect(perDatabaseArgs('findMany', args)).toEqual({
      orderBy: { n: 'asc' },
      take: 4,
    });
    expect(mergeScatter('findMany', args, [a, b])).toEqual([
      { n: 2 },
      { n: 3 },
      { n: 4 },
    ]);
    expect(
      mergeScatter('findMany', { orderBy: { n: 'desc' } }, [a, b]),
    ).toEqual([{ n: null }, { n: 4 }, { n: 3 }, { n: 2 }, { n: 1 }]);
  });

  it('findFirst honours orderBy, findUnique takes the first hit', () => {
    expect(
      mergeScatter('findFirst', { orderBy: { n: 'desc' } }, [
        { n: 1 },
        null,
        { n: 9 },
      ]),
    ).toEqual({ n: 9 });
    expect(mergeScatter('findUnique', {}, [null, { id: 'x' }])).toEqual({
      id: 'x',
    });
    expect(mergeScatter('findFirst', {}, [null, null])).toBeNull();
  });

  it('refuses what it cannot merge exactly', () => {
    expect(canScatter('groupBy', {})).toBe(false);
    expect(canScatter('groupBy', { by: ['a'], _avg: { n: true } })).toBe(false);
    expect(canScatter('findMany', { cursor: { id: 'x' } })).toBe(false);
    expect(canScatter('findMany', { distinct: ['a'] })).toBe(false);
    expect(
      canScatter('findMany', { orderBy: { author: { name: 'asc' } } }),
    ).toBe(false);
    expect(
      canScatter('findMany', { select: { id: true }, orderBy: { n: 'asc' } }),
    ).toBe(false);
    expect(canScatter('count', { select: { _all: true } })).toBe(false);
    expect(
      canScatter('findMany', {
        where: {},
        orderBy: [{ n: 'asc' }, { id: 'asc' }],
      }),
    ).toBe(true);
    expect(canScatter('count', { where: {} })).toBe(true);
  });

  it('aggregate: sums counts and sums, min/max of partials; avg is not scattered', () => {
    const args = {
      _count: true,
      _sum: { n: true },
      _min: { n: true },
      _max: { n: true },
    };
    expect(canScatter('aggregate', args)).toBe(true);
    expect(canScatter('aggregate', { _avg: { n: true } })).toBe(false);
    expect(canScatter('aggregate', { take: 3, _count: true })).toBe(false);
    expect(
      mergeScatter('aggregate', args, [
        { _count: 2, _sum: { n: 5 }, _min: { n: 2 }, _max: { n: 3 } },
        { _count: 3, _sum: { n: null }, _min: { n: 1 }, _max: { n: 9 } },
      ]),
    ).toEqual({ _count: 5, _sum: { n: 5 }, _min: { n: 1 }, _max: { n: 9 } });
  });

  it('groupBy: merges equal keys, re-sorts by aggregate and re-applies take; having is not scattered', () => {
    const args = {
      by: ['t'],
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 2,
    };
    expect(canScatter('groupBy', args)).toBe(true);
    expect(canScatter('groupBy', { ...args, having: {} })).toBe(false);
    expect(perDatabaseArgs('groupBy', args)).toEqual({
      by: ['t'],
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
    });
    const a = [
      { t: 'x', _count: { _all: 1 } },
      { t: 'y', _count: { _all: 2 } },
    ];
    const b = [
      { t: 'x', _count: { _all: 4 } },
      { t: 'z', _count: { _all: 3 } },
    ];
    expect(mergeScatter('groupBy', args, [a, b])).toEqual([
      { t: 'x', _count: { _all: 5 } },
      { t: 'z', _count: { _all: 3 } },
    ]);
  });
});
