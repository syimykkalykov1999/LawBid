import {
  assessShardGrowth,
  PREPARE_FROM,
  type ShardGrowthInput,
} from './shard-growth';

const GB = 1024 ** 3;
const base: ShardGrowthInput = {
  dbBytes: 40 * GB,
  rows: 50_000_000,
  thresholdGb: 400,
  thresholdRows: 1_000_000_000,
  targets: [],
  shardsOnPrimary: 256,
};

describe('assessShardGrowth', () => {
  it('green far from both thresholds, and a move is never automatic', () => {
    const g = assessShardGrowth(base);
    expect(g.status).toBe('green');
    expect(g.ratio).toBe(0.1);
    expect(g.autoMove).toBe(false);
  });

  it('yellow from 80% of the size threshold, red at 100%', () => {
    expect(
      assessShardGrowth({ ...base, dbBytes: 400 * PREPARE_FROM * GB }).status,
    ).toBe('yellow');
    expect(assessShardGrowth({ ...base, dbBytes: 399 * GB }).status).toBe(
      'yellow',
    );
    expect(assessShardGrowth({ ...base, dbBytes: 400 * GB }).status).toBe(
      'red',
    );
  });

  it('the rows threshold alone is enough; the larger ratio wins', () => {
    const g = assessShardGrowth({ ...base, rows: 900_000_000 });
    expect(g.status).toBe('yellow');
    expect(g.ratio).toBe(0.9);
    expect(
      assessShardGrowth({ ...base, dbBytes: 380 * GB, rows: 1_100_000_000 })
        .ratio,
    ).toBe(1.1);
  });

  it('plan: the upper half of the primary shards, rows split in proportion', () => {
    const g = assessShardGrowth({
      ...base,
      rows: 800_000_000,
      dbBytes: 500 * GB,
    });
    expect(g.plan).toEqual({
      shards: 128,
      rows: 400_000_000,
      // 400M / 4000 per second + 128 shards x 20 s
      estimatedSeconds: 100_000 + 2_560,
    });
  });

  it('odd number of shards: the move tool leaves the bigger half in place', () => {
    const g = assessShardGrowth({ ...base, shardsOnPrimary: 5, rows: 1000 });
    expect(g.plan?.shards).toBe(2);
    expect(g.plan?.rows).toBe(400);
  });

  it('no plan when one shard or none sits on the primary', () => {
    expect(assessShardGrowth({ ...base, shardsOnPrimary: 1 }).plan).toBeNull();
    expect(assessShardGrowth({ ...base, shardsOnPrimary: 0 }).plan).toBeNull();
  });

  it('target ready only when DATABASE_URL_SHARDS names a database', () => {
    expect(assessShardGrowth(base).targetReady).toBe(false);
    const g = assessShardGrowth({ ...base, targets: ['db1'] });
    expect(g.targetReady).toBe(true);
    expect(g.targets).toEqual(['db1']);
  });

  it('a zero threshold counts as off for that number', () => {
    const g = assessShardGrowth({ ...base, thresholdGb: 0, dbBytes: 9e12 });
    expect(g.status).toBe('green');
  });
});
