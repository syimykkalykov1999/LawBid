import { dailyDue, readDailySnapshot } from './snapshot-gate';

const at = (iso: string) => new Date(iso);
describe('dailyDue', () => {
  it('is due when nothing is stored', () => {
    expect(dailyDue(undefined)).toBe(true);
  });
  it('is not due for a recent value outside the quiet hour', () => {
    expect(dailyDue('2026-10-25T10:00:00Z', at('2026-10-25T20:00:00Z'))).toBe(
      false,
    );
  });
  it('is due in the 04 UTC hour when at least 20 h old', () => {
    expect(dailyDue('2026-10-24T07:00:00Z', at('2026-10-25T04:10:00Z'))).toBe(
      true,
    );
    expect(dailyDue('2026-10-25T01:00:00Z', at('2026-10-25T04:10:00Z'))).toBe(
      false,
    );
  });
  it('is due after 26 h at any hour', () => {
    expect(dailyDue('2026-10-24T00:00:00Z', at('2026-10-25T03:00:00Z'))).toBe(
      true,
    );
  });
});

describe('readDailySnapshot (round 4, С11)', () => {
  const store = (stored: { data: number; computedAt: string } | null) => {
    const refresh = jest.fn(
      async (_k: string, compute: () => Promise<number>) => ({
        data: await compute(),
        computedAt: new Date().toISOString(),
      }),
    );
    return { peek: jest.fn(() => Promise.resolve(stored)), refresh };
  };

  it('answers from the stored copy without counting', async () => {
    const s = store({ data: 7, computedAt: '2026-10-25T04:05:00Z' });
    const compute = jest.fn(() => Promise.resolve(99));
    await expect(
      readDailySnapshot(s as never, 'k', compute, at('2026-10-25T15:00:00Z')),
    ).resolves.toBe(7);
    expect(compute).not.toHaveBeenCalled();
    expect(s.refresh).not.toHaveBeenCalled();
  });

  it('a due copy is still answered at once and recounted once in the background', async () => {
    const s = store({ data: 7, computedAt: '2026-10-24T04:05:00Z' });
    const compute = jest.fn(() => Promise.resolve(99));
    await expect(
      readDailySnapshot(s as never, 'k', compute, at('2026-10-25T04:30:00Z')),
    ).resolves.toBe(7);
    expect(s.refresh).toHaveBeenCalledTimes(1);
  });

  it('nothing stored: counts once and waits for it', async () => {
    const s = store(null);
    await expect(
      readDailySnapshot(s as never, 'k', () => Promise.resolve(5)),
    ).resolves.toBe(5);
    expect(s.refresh).toHaveBeenCalledWith('k', expect.any(Function), true);
  });
});
