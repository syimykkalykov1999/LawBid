import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canAct, canOpen } from './rbac';

/**
 * Round 4 admin check (25.11): the panel and the API answer the same.
 *  - С10: an action the API marks with its own role list opens only for
 *    that role holding the area at «manage» (the owner always);
 *  - В1: /pnl and the document forms are filed under an area on the API
 *    (money, content), so the role alone does not open them;
 *  - В3: a link through the proxy never repeats `admin/` (the proxy adds it).
 */
describe('canAct (С10)', () => {
  const supportMoney = { role: 'support' as const, permissions: { money: 'manage' as const } };
  const financeMoney = { role: 'finance' as const, permissions: { money: 'manage' as const } };
  const financeView = { role: 'finance' as const, permissions: { money: 'view' as const } };

  it('the owner always acts', () => {
    expect(canAct({ role: 'super_admin', permissions: {} }, 'money', ['finance'])).toBe(true);
  });

  it('a role outside the action list does not act, whatever its toggles', () => {
    expect(canAct(supportMoney, 'money', ['finance'])).toBe(false);
  });

  it('the listed role acts only with the area at «manage»', () => {
    expect(canAct(financeMoney, 'money', ['finance'])).toBe(true);
    expect(canAct(financeView, 'money', ['finance'])).toBe(false);
  });

  it('nobody signed in: no', () => {
    expect(canAct(undefined, 'money', ['finance'])).toBe(false);
  });
});

describe('sections the API files under an area (В1)', () => {
  it('/pnl: finance with money, not finance alone', () => {
    expect(canOpen({ role: 'finance', permissions: { money: 'view' } }, '/pnl')).toBe(true);
    expect(canOpen({ role: 'finance', permissions: { payroll: 'manage' } }, '/pnl')).toBe(false);
    expect(canOpen({ role: 'support', permissions: { money: 'manage' } }, '/pnl')).toBe(false);
  });

  it('/form-templates: a moderator with «Посты и отзывы»', () => {
    expect(canOpen({ role: 'moderator', permissions: { content: 'manage' } }, '/form-templates')).toBe(true);
    expect(canOpen({ role: 'moderator', permissions: { moderation: 'manage' } }, '/form-templates')).toBe(false);
  });
});

describe('links through the proxy (В3)', () => {
  const files = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) files(p, out);
      else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
    }
    return out;
  };

  it('no source file links to /api/proxy/admin/… (the proxy already adds admin/)', () => {
    const root = join(__dirname, '..');
    const bad = files(root).filter((p) => readFileSync(p, 'utf8').includes('/api/proxy/admin/'));
    expect(bad).toEqual([]);
  });
});
