import { judgeTables, MIN_ROWS_FOR_RATIO } from './db-health.job';

const GB = 1024 ** 3;
const limits = { sizeBytes: 20 * GB, deadRatio: 0.2 };

describe('judgeTables (DB-ops S5-1 / S5-15)', () => {
  it('flags a table at 20 GB as large', () => {
    const [a, b] = judgeTables(
      [
        { table: 'messages', live: 1_000_000, dead: 0, bytes: 20 * GB },
        { table: 'sessions', live: 1_000_000, dead: 0, bytes: 20 * GB - 1 },
      ],
      limits,
    );
    expect(a.large).toBe(true);
    expect(b.large).toBe(false);
  });

  it('flags 20 % dead rows in a big table as bloated, with the ratio', () => {
    const [v] = judgeTables(
      [{ table: 'notifications', live: 800_000, dead: 200_000, bytes: GB }],
      limits,
    );
    expect(v.ratio).toBe(0.2);
    expect(v.bloated).toBe(true);
  });

  it('a small table has no ratio and is never bloated', () => {
    const [v] = judgeTables(
      [{ table: 'tiny', live: 1, dead: MIN_ROWS_FOR_RATIO - 2, bytes: 8192 }],
      limits,
    );
    expect(v.ratio).toBeNull();
    expect(v.bloated).toBe(false);
  });

  it('a mid-size table reports the ratio but does not alert (< 100k rows)', () => {
    const [v] = judgeTables(
      [{ table: 'mid', live: 5_000, dead: 50_000, bytes: GB }],
      limits,
    );
    expect(v.ratio).toBeGreaterThan(0.9);
    expect(v.bloated).toBe(false);
  });

  it('a limit of 0 switches that signal off', () => {
    const [v] = judgeTables(
      [{ table: 'x', live: 100_000, dead: 900_000, bytes: 100 * GB }],
      { sizeBytes: 0, deadRatio: 0 },
    );
    expect(v.large).toBe(false);
    expect(v.bloated).toBe(false);
  });
});
