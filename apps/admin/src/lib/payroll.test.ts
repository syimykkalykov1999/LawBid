import { describe, expect, it } from 'vitest';
import { moved, slotName } from '@/components/integrations/integration-card';
import { fieldNameFrom } from '@/components/integrations/custom-service-dialog';
import { centsToInput, currentPeriod, parseDollars, stripeFee, toCsv, totalsByCurrency, totalsText } from './payroll';
import { can, canOpen } from './rbac';

describe('payroll helpers', () => {
  it('reads dollar amounts the way people type them', () => {
    expect(parseDollars('2500')).toBe(250_000);
    expect(parseDollars('$2,500.50')).toBe(250_050);
    expect(parseDollars('2 500,5')).toBe(250_050);
    expect(parseDollars('0')).toBeNull();
    expect(parseDollars('abc')).toBeNull();
    expect(parseDollars('1.234')).toBeNull();
    expect(centsToInput(250_000)).toBe('2500');
    expect(centsToInput(250_050)).toBe('2500.50');
    expect(parseDollars('0', { allowZero: true })).toBe(0);
    expect(parseDollars('-50', { allowNegative: true })).toBe(-5_000);
    expect(parseDollars('-50')).toBeNull();
  });

  it('estimates the Stripe fee the employee pays', () => {
    const fees = { percent: 0.25, fixedCents: 25, monthlyCents: 200 };
    expect(stripeFee(100_000, fees, true)).toBe(475);
    expect(stripeFee(100_000, fees, false)).toBe(275);
  });

  it('adds the calculator up per currency', () => {
    const t = totalsByCurrency([
      { currency: 'usd', cents: 100_000 },
      { currency: 'usd', cents: 50_050 },
    ]);
    expect(t).toEqual({ usd: 150_050 });
    expect(totalsText(t)).toBe('$1,500.50');
    expect(currentPeriod(new Date(2026, 9, 5))).toBe('2026-10');
  });

  it('CSV quotes text and blocks spreadsheet formulas', () => {
    expect(toCsv(['a', 'b'], [['=SUM(A1)', 'x, y']])).toBe(`a,b\n'=SUM(A1),"x, y"`);
  });
});

describe('key sets', () => {
  it('moves a key up and down, not past the ends', () => {
    expect(moved(['main', 'b', 'c'], 'b', -1)).toEqual(['b', 'main', 'c']);
    expect(moved(['main', 'b', 'c'], 'c', 1)).toEqual(['main', 'b', 'c']);
    expect(slotName({ slot: 'main', label: null })).toBe('Основной ключ');
    expect(slotName({ slot: 'k1', label: 'Запасной' })).toBe('Запасной');
    expect(fieldNameFrom('Client ID')).toBe('clientId');
    expect(fieldNameFrom('Ключ')).toBe('');
  });
});

describe('trusted deputy (owner 2026-10-05)', () => {
  const deputy = {
    role: 'support' as const,
    permissions: { cases: 'manage' as const },
    canManageAdmins: true,
  };
  const plain = {
    role: 'finance' as const,
    permissions: { payroll: 'manage' as const },
  };
  it('reads every section but the keys, runs payroll, writes only granted areas', () => {
    expect(can(deputy, 'users')).toBe(true);
    expect(can(deputy, 'users', 'manage')).toBe(false);
    expect(can(deputy, 'cases', 'manage')).toBe(true);
    expect(can(deputy, 'payroll', 'manage')).toBe(true);
    expect(canOpen(deputy, '/payments')).toBe(true);
    expect(canOpen(deputy, '/audit-log')).toBe(true);
    expect(canOpen(deputy, '/integrations')).toBe(false);
  });
  it('an admin sees only their areas', () => {
    expect(canOpen(plain, '/payroll')).toBe(true);
    expect(canOpen(plain, '/payments')).toBe(false);
    expect(canOpen(plain, '/users')).toBe(false);
  });
});
