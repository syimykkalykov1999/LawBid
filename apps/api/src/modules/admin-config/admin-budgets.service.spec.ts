import { BadRequestException } from '@nestjs/common';
import { parseAutoscaleSettings } from '../../common/cost-guard/cost-autoscale.rules';
import { AdminBudgetsService } from './admin-budgets.service';

const ADMIN = { id: 'a1', ip: '1.2.3.4' } as never;
const env = (_p: string, w: string) =>
  w === 'minute' ? 30 : w === 'daily' ? 300 : 5000;

function build(stored: Record<string, unknown> = {}) {
  const rows = new Map<string, unknown>(Object.entries(stored));
  const tx = {
    appConfig: {
      findUnique: jest.fn((a: { where: { key: string } }) =>
        Promise.resolve(
          rows.has(a.where.key) ? { value: rows.get(a.where.key) } : null,
        ),
      ),
      upsert: jest.fn(
        (a: { where: { key: string }; update: { value: unknown } }) => {
          rows.set(a.where.key, a.update.value);
          return Promise.resolve({});
        },
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const autoscale = {
    readSettings: jest.fn(() => {
      const map = Object.fromEntries(rows);
      return Promise.resolve({
        settings: parseAutoscaleSettings(map['budget.autoscale'], env),
        stored: map,
      });
    }),
    lastAutoAt: jest.fn(() => Promise.resolve({})),
    usage: jest.fn(() => Promise.resolve({ today: 3, month: 9 })),
    effectiveCap: jest.fn(
      (s: Record<string, unknown>, p: string, w: string) =>
        (s[
          `budget.${p}.${w === 'minute' ? 'per_minute_max' : w === 'daily' ? 'daily_max' : 'monthly_max'}`
        ] as number | undefined) ?? env(p, w),
    ),
    envDefault: jest.fn(env),
    recomputeProvider: jest.fn(() => Promise.resolve([])),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const redis = { del: jest.fn(() => Promise.resolve(1)) };
  const service = new AdminBudgetsService(
    prisma as never,
    redis as never,
    autoscale as never,
    audit as never,
  );
  return { service, rows, autoscale, audit };
}

describe('AdminBudgetsService', () => {
  it('lists 6 providers × 3 windows with mode, bounds, cap and usage', async () => {
    const { service } = build({ 'budget.sms.daily_max': 800 });
    const list = await service.list();
    expect(list).toHaveLength(18);
    expect(
      list.find((r) => r.provider === 'sms' && r.window === 'daily'),
    ).toEqual({
      provider: 'sms',
      window: 'daily',
      mode: 'auto',
      floor: 300,
      ceiling: 3000,
      cap: 800,
      envDefault: 300,
      usedToday: 3,
      usedThisMonth: 9,
      lastAutoAt: null,
    });
  });

  it('auto: stores floor/ceiling, audits and recomputes the provider', async () => {
    const { service, rows, autoscale, audit } = build();
    await service.update(ADMIN, 'email', 'daily', {
      mode: 'auto',
      floor: 100,
      ceiling: 900,
    });
    expect(rows.get('budget.autoscale')).toEqual({
      email: { daily: { mode: 'auto', floor: 100, ceiling: 900 } },
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(autoscale.recomputeProvider).toHaveBeenCalledWith('email');
  });

  it('manual: writes the cap row (0 = off) and does not recompute', async () => {
    const { service, rows, autoscale, audit } = build();
    const out = await service.update(ADMIN, 'sms', 'monthly', {
      mode: 'manual',
      value: 0,
    });
    expect(rows.get('budget.sms.monthly_max')).toBe(0);
    expect(out.mode).toBe('manual');
    expect(out.cap).toBe(0);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(autoscale.recomputeProvider).not.toHaveBeenCalled();
  });

  it('refuses a minimum above the ceiling', async () => {
    const { service } = build();
    await expect(
      service.update(ADMIN, 'sms', 'daily', {
        mode: 'auto',
        floor: 500,
        ceiling: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
