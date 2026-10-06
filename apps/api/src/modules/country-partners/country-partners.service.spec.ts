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
    contract_expired_at: null,
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
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
  const svc = new CountryPartnersService(
    prisma as never,
    payroll as never,
    email,
    sessions as never,
  );
  return { svc, prisma, payroll, settlements, accruals, email, sessions };
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

  describe('contract end («Договор до»)', () => {
    it('switches the partner off once the last day has passed', async () => {
      const { svc, prisma, email, sessions } = build();
      (prisma.user as Record<string, jest.Mock>).findMany = jest
        .fn()
        .mockResolvedValueOnce([{ id: 'lead-1' }, { id: 'staff-1' }])
        .mockResolvedValueOnce([{ email: 'owner@x.io' }]);
      (prisma.user as Record<string, jest.Mock>).updateMany = jest
        .fn()
        .mockResolvedValue({ count: 2 });
      prisma.countryPartner.update = jest.fn(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(
            partner({
              contract_ends_at: new Date('2026-10-15T00:00:00Z'),
              ...data,
            }),
          ),
      );
      const p = partner({ contract_ends_at: new Date('2026-10-15T00:00:00Z') });

      const after = await svc.expireContract(p, now);

      expect(after?.status).toBe('disabled');
      expect(after?.contract_expired_at).toEqual(now);
      expect(prisma.countryPartner.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({
          status: 'disabled',
          suspended_admin_ids: ['lead-1', 'staff-1'],
        }),
      });
      expect(sessions.revokeAllForUser).toHaveBeenCalledTimes(2);
      // The owner and the partner both hear about it.
      expect(email.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('does nothing on the last day itself, without a date or when already off', async () => {
      const { svc, prisma } = build();
      const lastDay = new Date('2026-11-02T00:00:00Z');
      expect(
        await svc.expireContract(partner({ contract_ends_at: lastDay }), now),
      ).toBeNull();
      expect(await svc.expireContract(partner(), now)).toBeNull();
      expect(
        await svc.expireContract(
          partner({
            status: 'disabled',
            contract_ends_at: new Date('2026-10-01T00:00:00Z'),
          }),
          now,
        ),
      ).toBeNull();
      expect(prisma.countryPartner.update).not.toHaveBeenCalled();
    });

    it('counts revenue only up to the last day and no month after it', async () => {
      const { svc, prisma, settlements } = build();
      const p = partner({ contract_ends_at: new Date('2026-09-20T00:00:00Z') });
      await svc.settlePartner(p, await svc.settings(), now);
      expect(settlements.map((x) => x.period)).toEqual(['2026-09']);
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paid_at: {
              gte: new Date('2026-09-01T00:00:00Z'),
              lt: new Date('2026-09-21T00:00:00Z'),
            },
          }),
        }),
      );
    });

    it('still pays what was earned when the contract ended, not after a manual switch-off', async () => {
      const { svc } = build();
      const ended = partner({
        status: 'disabled',
        contract_ends_at: new Date('2026-10-31T00:00:00Z'),
        contract_expired_at: new Date('2026-11-01T03:00:00Z'),
        disabled_at: new Date('2026-11-01T03:00:00Z'),
      });
      await svc.settlePartner(ended, await svc.settings(), now);
      expect(await svc.release(ended)).toBe(2);

      const { svc: svc2 } = build();
      const manual = partner({
        status: 'disabled',
        disabled_at: new Date('2026-11-01T03:00:00Z'),
      });
      await svc2.settlePartner(manual, await svc2.settings(), now);
      expect(await svc2.release(manual)).toBe(0);
    });
  });
});
