import {
  computePlan,
  nextRunDate,
  periodOf,
  runDue,
  type PlanInput,
} from './treasury-plan';
import { resolveBanks } from './treasury.service';

const base: PlanInput = {
  availableCents: 1_000_000, // $10,000
  services: [
    { name: 'AWS', monthlyCents: 14_000 },
    { name: 'Twilio', monthlyCents: 2_000 },
  ],
  payrollStripeCents: 0,
  payrollBankCents: 100_000, // $1,000 salary by bank
  owedCents: 5_000,
  owedViaStripe: false,
  refundBufferCents: 20_000,
  bufferPercent: 50,
  minProfitCents: 5_000,
  expensesPaidThisPeriod: false,
};

describe('computePlan (owner 2026-10-05: only net profit to the card)', () => {
  it('pays a month of expenses, keeps the reserve on Stripe, sends the rest as profit', () => {
    const p = computePlan(base);
    // Services $160 + salary by bank $1,000 + partners owed by bank $50.
    expect(p.expenseAllowanceCents).toBe(121_000);
    // Only the refund buffer stays for Stripe-paid things.
    expect(p.stripeObligationsCents).toBe(20_000);
    expect(p.monthlyCostCents).toBe(141_000);
    // 50 % of a month as a cushion.
    expect(p.cushionCents).toBe(70_500);
    expect(p.reserveTargetCents).toBe(90_500);
    expect(p.expensePayoutCents).toBe(121_000);
    expect(p.profitPayoutCents).toBe(1_000_000 - 121_000 - 90_500);
    expect(p.shortfallCents).toBe(0);
    // What stays covers ~0.6 of a month (reserve / monthly cost).
    expect(p.coverMonths).toBe(0.6);
  });

  it('keeps Stripe payroll and owed commissions on the balance when they go through Stripe', () => {
    const p = computePlan({
      ...base,
      payrollStripeCents: 100_000,
      payrollBankCents: 0,
      owedViaStripe: true,
    });
    expect(p.expenseAllowanceCents).toBe(16_000);
    expect(p.stripeObligationsCents).toBe(100_000 + 5_000 + 20_000);
    expect(p.reserveTargetCents).toBe(125_000 + Math.round(141_000 / 2));
  });

  it('pays expenses first when the balance is short; no profit, shortfall reported', () => {
    const p = computePlan({ ...base, availableCents: 100_000 });
    expect(p.expensePayoutCents).toBe(100_000);
    expect(p.profitPayoutCents).toBe(0);
    expect(p.shortfallCents).toBe(121_000 + 90_500 - 100_000);
  });

  it('does not pay the expense account twice in a month', () => {
    const p = computePlan({ ...base, expensesPaidThisPeriod: true });
    expect(p.expensePayoutCents).toBe(0);
    expect(p.profitPayoutCents).toBe(1_000_000 - 90_500);
  });

  it('holds tiny profit for the next month', () => {
    const p = computePlan({
      ...base,
      availableCents: 121_000 + 90_500 + 4_999,
    });
    expect(p.profitPayoutCents).toBe(0);
    expect(p.heldProfitCents).toBe(4_999);
  });

  it('never goes negative on odd input', () => {
    const p = computePlan({
      ...base,
      availableCents: -5,
      owedCents: -100,
      services: [{ name: 'x', monthlyCents: Number.NaN }],
    });
    expect(p.expensePayoutCents).toBe(0);
    expect(p.profitPayoutCents).toBe(0);
    expect(p.servicesCents).toBe(0);
  });
});

describe('payout schedule', () => {
  it('runs on the payout day, or later when the day was missed, once a month', () => {
    expect(runDue(new Date('2026-10-24T20:00:00Z'), 25, false)).toBe(false);
    expect(runDue(new Date('2026-10-25T15:40:00Z'), 25, false)).toBe(true);
    expect(runDue(new Date('2026-10-27T15:40:00Z'), 25, false)).toBe(true);
    expect(runDue(new Date('2026-10-27T15:40:00Z'), 25, true)).toBe(false);
  });

  it('names the next run date', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    expect(nextRunDate(now, 25, false).toISOString()).toBe(
      '2026-10-25T00:00:00.000Z',
    );
    expect(nextRunDate(now, 25, true).toISOString()).toBe(
      '2026-11-25T00:00:00.000Z',
    );
    expect(nextRunDate(now, 3, false).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(periodOf(now)).toBe('2026-10');
  });
});

describe('resolveBanks (only the banks in Stripe; no bank is chosen in LawBid)', () => {
  const chase = { id: 'ba_1', label: 'Chase', last4: '1', isDefault: true };
  const mercury = {
    id: 'ba_2',
    label: 'Mercury',
    last4: '2',
    isDefault: false,
  };
  const relay = { id: 'ba_3', label: 'Relay', last4: '3', isDefault: false };

  it('profit → the default bank, expenses → the one other bank', () => {
    expect(resolveBanks([mercury, chase])).toEqual({
      profit: chase,
      expense: mercury,
    });
  });

  it('one bank: expenses go to the default bank too', () => {
    expect(resolveBanks([chase])).toEqual({ profit: chase, expense: null });
  });

  it('three banks are ambiguous: expenses go to the default bank', () => {
    expect(resolveBanks([chase, mercury, relay]).expense).toBeNull();
  });

  it('no list from Stripe: nothing named, Stripe default used', () => {
    expect(resolveBanks(null)).toEqual({ profit: null, expense: null });
  });
});
