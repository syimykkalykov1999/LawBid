import {
  buildTotals,
  DashboardService,
  TOTALS_BUTTON_COOLDOWN_MS,
  USER_TOTALS_KEY,
} from './dashboard.service';

const ROWS = [
  { role: 'client', total: 10n, active: 8n, verified: 3n },
  { role: 'attorney', total: 5n, active: 4n, verified: 2n },
  { role: 'admin', total: 1n, active: 1n, verified: 0n },
];

describe('buildTotals', () => {
  it('maps GROUP BY rows, assistants from seats, and sums all', () => {
    const t = buildTotals(ROWS, { total: 4n, active: 3n }, 'T');
    expect(t.clients).toEqual({ total: 10, active: 8, verified: 3 });
    expect(t.attorneys).toEqual({ total: 5, active: 4, verified: 2 });
    expect(t.admins).toEqual({ total: 1, active: 1, verified: null });
    expect(t.assistants).toEqual({ total: 4, active: 3, verified: null });
    expect(t.all).toEqual({ total: 20, active: 16, verified: null });
    expect(t.computedAt).toBe('T');
  });
  it('is all zeros for an empty database', () => {
    const t = buildTotals([], undefined, 'T');
    expect(t.all.total).toBe(0);
    expect(t.clients.verified).toBe(0);
  });
});

function setup(stored?: { data: unknown; computedAt: string }) {
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce(ROWS)
    .mockResolvedValueOnce([{ total: 4n, active: 3n }]);
  const prisma = {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ $executeRaw: jest.fn(), $queryRaw: queryRaw }),
  } as never;
  const summary = {
    peek: jest.fn().mockResolvedValue(stored ?? null),
    refresh: jest.fn(async (_k: string, c: () => Promise<unknown>) => ({
      data: await c(),
      computedAt: new Date().toISOString(),
    })),
    get: jest.fn(),
  };
  const svc = new DashboardService(prisma, summary as never);
  return { svc, summary, queryRaw };
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('DashboardService.totals (daily stamp)', () => {
  it('reuses a stored value younger than 24 h without counting', async () => {
    const stored = { data: { all: { total: 7 } }, computedAt: ago(3_600_000) };
    const { svc, summary, queryRaw } = setup(stored);
    expect(await svc.totals()).toEqual(stored.data);
    expect(summary.refresh).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it('recounts when the stamp is older than 24 h', async () => {
    const { svc, summary, queryRaw } = setup({
      data: {},
      computedAt: ago(27 * 3_600_000),
    });
    const t = await svc.totals();
    expect(summary.refresh).toHaveBeenCalledWith(
      USER_TOTALS_KEY,
      expect.any(Function),
    );
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(t.all.total).toBe(20);
  });
  it('counts when nothing is stored', async () => {
    const { svc, queryRaw } = setup();
    await svc.totals();
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});

describe('DashboardService.refreshTotals (button)', () => {
  it('does nothing inside the 10-minute cooldown', async () => {
    const { svc, summary } = setup({
      data: {},
      computedAt: ago(TOTALS_BUTTON_COOLDOWN_MS - 60_000),
    });
    await svc.refreshTotals();
    expect(summary.refresh).not.toHaveBeenCalled();
  });
  it('recounts totals and the dashboard after the cooldown', async () => {
    const { svc, summary } = setup({
      data: {},
      computedAt: ago(TOTALS_BUTTON_COOLDOWN_MS + 60_000),
    });
    jest
      .spyOn(svc as unknown as { compute: () => Promise<unknown> }, 'compute')
      .mockResolvedValue({});
    await svc.refreshTotals();
    const keys = summary.refresh.mock.calls.map((c) => c[0]);
    expect(keys).toEqual([USER_TOTALS_KEY, 'dashboard']);
  });
});
