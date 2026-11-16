import { PnlService, PNL_BUTTON_COOLDOWN_MS } from './pnl.service';

function make(stored: { computedAt: string } | null) {
  const summary = {
    peek: jest.fn().mockResolvedValue(stored ? { data: {}, ...stored } : null),
    refresh: jest.fn().mockResolvedValue({ data: {}, computedAt: 'new' }),
  };
  const svc = new PnlService({} as never, summary as never, undefined);
  return { svc, summary };
}

describe('PnlService button', () => {
  it('does not recount inside 10 minutes', async () => {
    const { svc, summary } = make({
      computedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await svc.refreshFromButton();
    expect(summary.refresh).not.toHaveBeenCalled();
  });

  it('recounts when older than 10 minutes or never counted', async () => {
    const old = make({
      computedAt: new Date(
        Date.now() - PNL_BUTTON_COOLDOWN_MS - 1000,
      ).toISOString(),
    });
    await old.svc.refreshFromButton();
    expect(old.summary.refresh).toHaveBeenCalledTimes(1);
    const none = make(null);
    await none.svc.refreshFromButton();
    expect(none.summary.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('PnlService payment rows (R3A-1)', () => {
  it('keeps refunded payments and books refunds on the day they happen', async () => {
    const calls: string[] = [];
    const prisma: Record<string, jest.Mock> = {
      $queryRaw: jest.fn((parts: TemplateStringsArray) => {
        calls.push(parts.join('?'));
        return Promise.resolve([]);
      }),
      $transaction: jest.fn(
        (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma),
      ),
      $executeRaw: jest.fn(() => Promise.resolve(0)),
      $executeRawUnsafe: jest.fn(() => Promise.resolve(0)),
    };
    const svc = new PnlService(prisma as never, undefined, undefined);
    await svc.compute(new Date('2026-10-25T12:00:00Z'));
    const sql = calls.join('\n');
    expect(sql).toMatch(/p\.status IN \('succeeded', 'refunded'\)/);
    expect(sql).toMatch(/r\.created_at AT TIME ZONE \?/);
    expect(sql).toMatch(/r\.status IN \('pending', 'succeeded'\)/);
  });
});

describe('PnlService report time zone (row 180, R3A-11)', () => {
  function prismaSpy() {
    const values: unknown[][] = [];
    const sql: string[] = [];
    const prisma: Record<string, jest.Mock> = {
      $queryRaw: jest.fn((parts: TemplateStringsArray, ...v: unknown[]) => {
        sql.push(parts.join('?'));
        values.push(v);
        return Promise.resolve([
          {
            day: '2026-11-16',
            kind: 'subscriptions',
            subtotal_cents: 10_000,
            gross_cents: 10_000,
            payments: 1,
            refunded_cents: 0,
          },
        ]);
      }),
      $transaction: jest.fn(
        (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma),
      ),
      $executeRaw: jest.fn(() => Promise.resolve(0)),
      $executeRawUnsafe: jest.fn(() => Promise.resolve(0)),
    };
    return { prisma, sql, values };
  }
  const settings = (tz: string | undefined) => ({
    string: jest.fn().mockResolvedValue(tz),
    number: jest.fn().mockResolvedValue(undefined),
  });

  it('cuts days at the owner midnight across UTC midnight', async () => {
    const { prisma, sql, values } = prismaSpy();
    const svc = new PnlService(
      prisma as never,
      undefined,
      undefined,
      settings('America/Los_Angeles') as never,
    );
    // Mon 16.11 19:00 PST = Tue 17.11 03:00 UTC.
    const s = await svc.compute(new Date('2026-11-17T03:00:00Z'));
    expect(s.asOf).toBe('2026-11-16');
    expect(s.today.revenueUsd).toBe(96.8);
    expect(sql.join('\n')).toMatch(/p\.paid_at AT TIME ZONE \?/);
    expect(sql.join('\n')).not.toMatch(/AT TIME ZONE 'UTC'/);
    const v = values[0];
    expect(v.filter((x) => x === 'America/Los_Angeles')).toHaveLength(2);
    // 11 weeks before Monday 16.11 = Monday 31.08, from its local midnight.
    expect(v.find((x): x is Date => x instanceof Date)?.toISOString()).toBe(
      '2026-08-31T07:00:00.000Z',
    );
  });

  it('an unknown zone falls back to the documented default', async () => {
    const { prisma, values } = prismaSpy();
    const svc = new PnlService(
      prisma as never,
      undefined,
      undefined,
      settings('Not/AZone') as never,
    );
    await svc.compute(new Date('2026-11-17T03:00:00Z'));
    expect(values[0]).toContain('America/Los_Angeles');
  });
});
