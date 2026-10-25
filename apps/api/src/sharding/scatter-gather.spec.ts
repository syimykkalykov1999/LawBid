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
});
