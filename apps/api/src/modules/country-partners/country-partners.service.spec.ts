import type { CountryPartner } from '@prisma/client';
import { CountryPartnersService } from './country-partners.service';

function partner(over: Partial<CountryPartner> = {}): CountryPartner {
  return {
    id: 'p1',
    country_code: 'CA',
    name: 'Maple Ltd',
    contact: null,
    lead_admin_id: 'lead-1',
    share_bps: 2000,
    status: 'active',
    max_admins: 10,
    payouts_enabled: true,
    payroll_employee_id: null,
    contract_starts_at: null,
    contract_ends_at: null,
    contract_version: 1,
    contract_accepted_at: null,
    contract_accepted_ip: null,
    goals: [],
    suspended_admin_ids: [],
    note: null,
    created_by: null,
    created_at: new Date('2026-09-10T00:00:00Z'),
    updated_at: new Date(),
    disabled_at: null,
    ...over,
  };
}

function build() {
  const settlements: Record<string, unknown>[] = [];
  const accruals = new Map<string, string>();
  const prisma = {
    appConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    payment: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ amount_cents: 9900, currency: 'usd' }]),
    },
    refund: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ email: 'p@x.io' }),
    },
    countryPartner: { update: jest.fn().mockResolvedValue({}) },
    countryPartnerSettlement: {
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          settlements.filter((s) =>
            where.status ? s.status === where.status : true,
          ),
        ),
      ),
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        const row = {
          id: `s${settlements.length + 1}`,
          accrual_ref: null,
          ...create,
        };
        settlements.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          const s = settlements.find((x) => x.id === where.id)!;
          Object.assign(s, data);
          return Promise.resolve(s);
        },
      ),
    },
    payrollAccrual: {
      findUnique: jest.fn(({ where }: { where: { event_ref: string } }) =>
        Promise.resolve(
          accruals.has(where.event_ref)
            ? { status: accruals.get(where.event_ref) }
            : null,
        ),
      ),
    },
  };
  const payroll = {
    accrue: jest.fn(({ eventRef }: { eventRef: string }) => {
      accruals.set(eventRef, 'pending');
      return Promise.resolve({
        employeeId: 'e1',
        accrualId: 'a1',
        created: true,
        status: 'pending',
      });
    }),
    cancel: jest.fn((ref: string) => {
      accruals.set(ref, 'canceled');
      return Promise.resolve('canceled');
    }),
  };
  const svc = new CountryPartnersService(prisma as never, payroll as never);
  return { svc, prisma, payroll, settlements, accruals };
}

describe('CountryPartnersService', () => {
  const now = new Date('2026-11-02T05:00:00Z');

  it('payouts off: waits; on: one accrual per month; stop → back to held → fresh ref', async () => {
    const { svc, settlements, payroll } = build();
    const off = partner({ payouts_enabled: false });
    await svc.settlePartner(off, await svc.settings(), now);
    expect(settlements.every((s) => s.status === 'held')).toBe(true);
    expect(await svc.release(off)).toBe(0);

    const on = partner();
    expect(await svc.release(on)).toBe(2);
    expect(payroll.accrue).toHaveBeenCalledTimes(2);
    const first = settlements[0].accrual_ref as string;
    expect(first).toMatch(/^country_partner:s1:/);
    // 20 % of (9900 − 317 fee) = 1916.
    expect(payroll.accrue.mock.calls[0][0]).toMatchObject({
      userId: 'lead-1',
      amountCents: 1916,
      period: '2026-09',
      source: 'country_partner',
    });

    expect(await svc.hold('p1')).toBe(2);
    expect(settlements.every((s) => s.status === 'held')).toBe(true);
    await svc.release(on);
    expect(settlements[0].accrual_ref).not.toBe(first);
    expect(payroll.accrue).toHaveBeenCalledTimes(4);
  });
});
