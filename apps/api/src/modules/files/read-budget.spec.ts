import { HttpException } from '@nestjs/common';
import { ReadBudget } from './read-budget';

/**
 * Security audit 2026-11-08 (L6): whole-file reads of confirm and the scan
 * job hold at most the budget's megabytes at once; the rest wait, and a
 * full line answers 429 instead of growing without end.
 */
const MB = 1024 * 1024;

function gate() {
  let open!: () => void;
  const done = new Promise<void>((r) => (open = r));
  return { done, open };
}
const flush = () => new Promise((r) => setImmediate(r));

describe('ReadBudget (audit L6)', () => {
  it('never holds more megabytes than the budget', async () => {
    const budget = new ReadBudget(100);
    let inFlight = 0;
    let peak = 0;
    const gates = [gate(), gate(), gate()];
    const jobs = gates.map((g) =>
      budget.run(40 * MB, async () => {
        inFlight += 40;
        peak = Math.max(peak, inFlight);
        await g.done;
        inFlight -= 40;
      }),
    );
    await flush();
    expect(inFlight).toBe(80); // the third 40 MB read waits
    gates.forEach((g) => g.open());
    await Promise.all(jobs);
    expect(peak).toBeLessThanOrEqual(100);
    expect(budget.freeMb()).toBe(100);
  });

  it('a file bigger than the budget runs alone, not never', async () => {
    const budget = new ReadBudget(10);
    await expect(
      budget.run(500 * MB, () => Promise.resolve('ok')),
    ).resolves.toBe('ok');
  });

  it('a full line answers 429', async () => {
    const budget = new ReadBudget(10, 1);
    const g = gate();
    const first = budget.run(10 * MB, () => g.done);
    await flush();
    const second = budget.run(10 * MB, () => Promise.resolve());
    await expect(
      budget.run(10 * MB, () => Promise.resolve()),
    ).rejects.toBeInstanceOf(HttpException);
    g.open();
    await Promise.all([first, second]);
  });

  it('a failing read gives its megabytes back', async () => {
    const budget = new ReadBudget(10);
    await expect(
      budget.run(10 * MB, () => Promise.reject(new Error('S3 down'))),
    ).rejects.toThrow('S3 down');
    expect(budget.freeMb()).toBe(10);
  });
});
