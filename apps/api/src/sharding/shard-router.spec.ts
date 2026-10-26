import { newShardedId } from './shard-id';
import { PRIMARY_DB, ShardMapRow, ShardRouter } from './shard-router';

const rows = (v: number, db1: number[]): ShardMapRow[] =>
  Array.from({ length: 256 }, (_, i) => ({
    logical_shard: i,
    physical_db: db1.includes(i) ? 'db1' : PRIMARY_DB,
    version: v,
  }));

describe('ShardRouter (shard-ready step 3)', () => {
  it('answers primary before any load and for unknown shards', () => {
    const r = new ShardRouter(null);
    expect(r.physicalFor(0)).toBe('primary');
    expect(r.physicalFor(255)).toBe('primary');
    expect(r.physicalFor(999)).toBe('primary');
  });

  it('applies the loaded map and routes case / user ids by their shard', async () => {
    const r = new ShardRouter(() => Promise.resolve(rows(1, [7])));
    await r.start();
    expect(r.physicalFor(7)).toBe('db1');
    expect(r.physicalFor(8)).toBe('primary');
    expect(r.forCase(newShardedId(7))).toBe('db1');
    expect(r.forCase(newShardedId(8))).toBe('primary');
    // user ids are legacy v4: shard = last byte
    expect(r.forUser('00000000-0000-4000-8000-000000000007')).toBe('db1');
    expect(r.physicalKeys().sort()).toEqual(['db1', 'primary']);
  });

  it('ignores a map older than the one in use (version fence)', () => {
    const r = new ShardRouter(() => Promise.resolve([]));
    expect(r.apply(rows(5, [1]))).toBe(true);
    expect(r.apply(rows(4, []))).toBe(false);
    expect(r.physicalFor(1)).toBe('db1');
    expect(r.apply(rows(5, [2]))).toBe(true);
    expect(r.physicalFor(1)).toBe('primary');
    expect(r.physicalFor(2)).toBe('db1');
    expect(r.mapVersion).toBe(5);
  });

  it('keeps the previous map when a load fails', async () => {
    let fail = false;
    const r = new ShardRouter(() =>
      fail
        ? Promise.reject(new Error('relation "shard_map" does not exist'))
        : Promise.resolve(rows(1, [3])),
    );
    await r.start();
    fail = true;
    await r.refresh();
    expect(r.physicalFor(3)).toBe('db1');
  });

  it('refreshes in the background after the TTL, not before', async () => {
    let now = 1_000_000;
    const loader = jest.fn(() => Promise.resolve(rows(1, [])));
    const r = new ShardRouter(loader, { ttlMs: 30_000, now: () => now });
    await r.start();
    expect(loader).toHaveBeenCalledTimes(1);
    now += 29_000;
    r.physicalFor(1);
    expect(loader).toHaveBeenCalledTimes(1);
    now += 2_000;
    r.physicalFor(1);
    r.physicalFor(2); // second lookup while the first reload is in flight
    await r.refresh();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not reload by itself before start()', () => {
    const loader = jest.fn(() => Promise.resolve(rows(1, [])));
    const r = new ShardRouter(loader);
    r.physicalFor(1);
    expect(loader).not.toHaveBeenCalled();
  });

  it('shares one load between concurrent refreshes', async () => {
    const loader = jest.fn(() => Promise.resolve(rows(1, [])));
    const r = new ShardRouter(loader);
    await Promise.all([r.refresh(), r.refresh(), r.refresh()]);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
