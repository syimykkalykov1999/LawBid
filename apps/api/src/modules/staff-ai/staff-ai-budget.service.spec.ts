import type { PrismaService } from '../../prisma/prisma.service';
import {
  StaffAiBudgetService,
  SPEND_SNAPSHOT_KEY,
} from './staff-ai-budget.service';
import { costMillicents, estimateMillicents } from './staff-ai-pricing';
import { StaffAiBudgetError } from './staff-ai.types';
import {
  AI_ON,
  MemRedis,
  memAppConfig,
  settingsOf,
} from './staff-ai.test-support';

const NOW = new Date('2026-10-27T10:00:00Z');

function make(cents: number) {
  const redis = new MemRedis();
  const db = memAppConfig();
  const svc = new StaffAiBudgetService(
    db as unknown as PrismaService,
    redis as never,
    settingsOf({ ...AI_ON, 'staff.ai.monthly_cents': cents }),
  );
  return { svc, redis, db };
}

describe('staff AI pricing', () => {
  it('Haiku 5.5 batch is half of the live price and cache reads cost a tenth', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0 };
    expect(costMillicents('claude-haiku-5-5', usage, false)).toBe(10_000); // 10 cents
    expect(costMillicents('claude-haiku-5-5', usage, true)).toBe(5_000);
    expect(
      costMillicents(
        'claude-haiku-5-5',
        {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 1_000_000,
        },
        false,
      ),
    ).toBe(1_000);
  });

  it('a typical night case costs a fraction of a cent: 1000 cases ≈ $0.05–0.30 on Haiku batch', () => {
    const one = costMillicents(
      'claude-haiku-5-5',
      { input_tokens: 1500, output_tokens: 300 },
      true,
    );
    const per1000Dollars = (one * 1000) / 100_000;
    expect(per1000Dollars).toBeGreaterThan(0.05);
    expect(per1000Dollars).toBeLessThan(0.3);
  });

  it('the pre-call estimate is never below the real cost', () => {
    const est = estimateMillicents('claude-haiku-5-5', 1500, 400, true);
    expect(est).toBeGreaterThanOrEqual(
      costMillicents(
        'claude-haiku-5-5',
        { input_tokens: 1500, output_tokens: 400 },
        true,
      ),
    );
  });
});

describe('StaffAiBudgetService (hard monthly ceiling)', () => {
  it('reserves, settles to the real cost and counts per feature', async () => {
    const { svc } = make(500);
    const r = await svc.reserve('hint', 4000, NOW);
    expect(await svc.spent(NOW)).toBe(4000);
    await svc.settle(r, 900, NOW);
    expect(await svc.spent(NOW)).toBe(900);
    expect((await svc.writeSnapshot(NOW)).byFeature).toEqual({ hint: 900 });
  });

  it('stops at the ceiling and does not keep the failed reservation', async () => {
    const { svc } = make(1); // 1 cent = 1000 millicents
    await svc.reserve('qa', 800, NOW);
    await expect(svc.reserve('qa', 300, NOW)).rejects.toBeInstanceOf(
      StaffAiBudgetError,
    );
    expect(await svc.spent(NOW)).toBe(800);
    await expect(svc.reserve('qa', 200, NOW)).resolves.toBeDefined();
    expect(await svc.remaining(NOW)).toBe(0);
  });

  it('a ceiling of 0 spends nothing at all', async () => {
    const { svc } = make(0);
    await expect(svc.reserve('hint', 1, NOW)).rejects.toBeInstanceOf(
      StaffAiBudgetError,
    );
  });

  it('release gives a failed call back', async () => {
    const { svc } = make(10);
    const r = await svc.reserve('hint', 500, NOW);
    await svc.release(r, NOW);
    expect(await svc.spent(NOW)).toBe(0);
  });

  it('a new month starts at zero', async () => {
    const { svc } = make(10);
    await svc.reserve('hint', 500, NOW);
    expect(await svc.spent(new Date('2026-11-02T00:00:00Z'))).toBe(0);
  });

  it('a flushed Redis is re-seeded from the nightly snapshot (same month only)', async () => {
    const { svc, redis, db } = make(100);
    await svc.reserve('qa', 7000, NOW);
    await svc.writeSnapshot(NOW);
    expect(db.rows.get(SPEND_SNAPSHOT_KEY)).toMatchObject({
      month: '2026-10',
      millicents: 7000,
    });
    redis.kv.clear();
    expect(await svc.spent(NOW)).toBe(7000);
    redis.kv.clear();
    expect(await svc.spent(new Date('2026-11-01T00:00:00Z'))).toBe(0);
  });
});
