import { describe, expect, it } from 'vitest';
import { GRANTABLE_AREAS, GROUPS, SECTIONS, canOpen, fitToMe, groupFor, groupsFor, summarizeRights, tabsFor } from './rbac';

// The 38 pages the menu had before it was grouped (owner 2026-10-05):
// every one keeps its URL and its own right.
const BEFORE = [
  '/', '/users', '/verification', '/client-badges', '/teams', '/moderation', '/sanctions', '/review-appeals',
  '/content', '/media', '/document-templates', '/cases', '/bids', '/promotions', '/prices', '/plans',
  '/subscriptions', '/contracts', '/payments', '/case-payments', '/promo-codes', '/referrals', '/payroll',
  '/partners', '/support', '/broadcasts', '/email-templates', '/flags', '/integrations', '/config',
  '/practice-areas', '/i18n', '/legal-documents', '/data-requests', '/exports', '/audit-log', '/sessions', '/admins',
];

describe('menu sections with tabs', () => {
  it('has 9 sections and keeps every old page exactly once', () => {
    expect(GROUPS.map((g) => g.label)).toEqual([
      'Дашборд', 'Люди', 'Галочки', 'Модерация', 'Кейсы', 'Деньги', 'Связь', 'Безопасность', 'Система',
    ]);
    const hrefs = SECTIONS.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of BEFORE) expect(hrefs).toContain(h);
  });

  it('shows a moderator only their own tabs and hides empty sections', () => {
    const mod = { role: 'moderator' as const, permissions: { moderation: 'manage' as const, content: 'view' as const } };
    expect(groupsFor(mod).map((g) => g.key)).toEqual(['home', 'moderation', 'system']);
    expect(tabsFor(mod, '/moderation').map((t) => t.href)).toEqual([
      '/moderation', '/media-moderation', '/review-appeals', '/moderation-appeals', '/moderation-auto', '/moderation-journal', '/legal-qa', '/group-chats', '/content', '/document-templates', '/form-templates', '/search',
    ]);
    // Document forms follow the API: super admin and moderators only.
    expect(canOpen(mod, '/form-templates')).toBe(true);
    expect(canOpen({ role: 'support' as const, permissions: { content: 'manage' as const } }, '/form-templates')).toBe(false);
    // Same section, tab without the right: not shown, URL answers 404.
    expect(canOpen(mod, '/sanctions')).toBe(false);
    expect(canOpen(mod, '/media')).toBe(false);
    expect(tabsFor(mod, '/money')).toEqual([]);
    expect(canOpen(mod, '/payments')).toBe(false);
    // System shows only «Квалификации» (content), so no tab row there.
    expect(tabsFor(mod, '/practice-areas').map((t) => t.href)).toEqual(['/practice-areas']);
  });

  it('gives everyone a workspace; the dashboard tab follows its right', () => {
    const v = { role: 'verifier' as const, permissions: { verification: 'manage' as const } };
    expect(canOpen(v, '/workspace')).toBe(true);
    expect(canOpen(v, '/')).toBe(false);
    expect(groupsFor(v)[0].items.map((s) => s.href)).toEqual(['/workspace']);
    expect(groupFor('/verification/abc')?.key).toBe('badges');
  });

  it('keeps owner-only tabs owner-only', () => {
    const deputy = { role: 'support' as const, permissions: {}, canManageAdmins: true };
    expect(canOpen(deputy, '/audit-log')).toBe(true);
    expect(canOpen(deputy, '/integrations')).toBe(false);
    expect(canOpen(deputy, '/rewards')).toBe(false);
    expect(canOpen({ role: 'super_admin' }, '/rewards')).toBe(true);
  });
});

describe('country partner team (owner 2026-10-06)', () => {
  const lead = {
    role: 'support' as const,
    countryPartnerId: 'p1',
    partnerLead: true,
    permissions: { verification: 'manage' as const, users: 'manage' as const, settings: 'manage' as const },
  };
  it('sees its page, its admins, simple sections only; never money or settings', () => {
    const hrefs = groupsFor(lead).flatMap((g) => g.items.map((s) => s.href));
    expect(hrefs).toContain('/partner');
    expect(hrefs).toContain('/admins');
    expect(hrefs).toContain('/verification');
    expect(hrefs).not.toContain('/country-partners');
    expect(hrefs).not.toContain('/flags');
    expect(hrefs).not.toContain('/payroll');
    expect(canOpen(lead, '/users')).toBe(true);
  });
  it('LawBid staff never see the partner page', () => {
    const staff = { role: 'support' as const, permissions: { support: 'manage' as const } };
    expect(canOpen(staff, '/partner')).toBe(false);
  });
});

describe('grantable money and audit (owner 2026-10-16)', () => {
  const acc = {
    role: 'finance' as const,
    permissions: { dashboard: 'view' as const, users: 'view' as const, money: 'view' as const, economy: 'view' as const, budget_limits: 'manage' as const },
  };
  it('an accountant opens money tabs and the budget caps, nothing owner-only', () => {
    for (const h of ['/payments', '/subscriptions', '/promo-codes', '/partners', '/treasury', '/config']) {
      expect(canOpen(acc, h)).toBe(true);
    }
    for (const h of ['/prices', '/plans', '/analytics', '/case-payments', '/country-partners', '/sessions', '/integrations', '/admins', '/audit-log', '/flags', '/payroll', '/exports']) {
      expect(canOpen(acc, h)).toBe(false);
    }
  });
  it('the audit log opens by its toggle', () => {
    const mod = { role: 'moderator' as const, permissions: { moderation: 'manage' as const } };
    expect(canOpen(mod, '/audit-log')).toBe(false);
    expect(canOpen({ ...mod, permissions: { audit: 'view' as const } }, '/audit-log')).toBe(true);
  });
  it('Настройки opens for budget caps alone, but other settings tabs stay closed', () => {
    const b = { role: 'support' as const, permissions: { budget_limits: 'manage' as const } };
    expect(canOpen(b, '/config')).toBe(true);
    expect(canOpen(b, '/flags')).toBe(false);
  });
  it('the deputy still reads the owner-only money pages', () => {
    const deputy = { role: 'support' as const, permissions: {}, canManageAdmins: true };
    for (const h of ['/prices', '/analytics', '/sessions', '/payments']) expect(canOpen(deputy, h)).toBe(true);
  });
  it('only the owner can hand out money, economy, budget caps and audit', () => {
    const owner = ['money', 'economy', 'budget_limits', 'audit'];
    expect(GRANTABLE_AREAS.filter((a) => a.ownerGrants).map((a) => a.key).sort()).toEqual(owner.sort());
    const manager = { role: 'support' as const, permissions: { users: 'manage' as const, money: 'view' as const } };
    expect(fitToMe({ users: 'manage', money: 'view', support: 'manage' }, manager)).toEqual({ users: 'manage' });
    expect(fitToMe({ users: 'manage', money: 'view' }, { role: 'super_admin', permissions: {} })).toEqual({ users: 'manage', money: 'view' });
  });
  it('summarizes the effective rights in words', () => {
    const s = summarizeRights({ money: 'view', budget_limits: 'manage' });
    expect(s.manage).toEqual(['Лимиты расходов']);
    expect(s.view).toEqual(['Деньги']);
    expect(s.closed).toContain('Пользователи');
    expect(s.closed).not.toContain('Деньги');
  });
});

describe('sections tied to a feature flag', () => {
  const owner = { role: 'super_admin' as const, permissions: {} };
  const hrefs = (off?: ReadonlySet<string>) => groupsFor(owner, off).flatMap((g) => g.items.map((s) => s.href));

  it('hides «Сроки» while the deadline_calculator flag is off', () => {
    expect(hrefs()).toContain('/deadlines');
    expect(hrefs(new Set(['deadline_calculator']))).not.toContain('/deadlines');
    expect(tabsFor(owner, '/cases', new Set(['deadline_calculator'])).map((t) => t.href)).not.toContain('/deadlines');
    expect(tabsFor(owner, '/cases').map((t) => t.href)).toContain('/deadlines');
  });
});
