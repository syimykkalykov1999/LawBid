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
  it('has the dashboard plus seven tabs and keeps every old page exactly once', () => {
    expect(GROUPS.map((g) => g.label)).toEqual([
      'Дашборд', 'Запуск', 'Деньги', 'Люди', 'Контент и модерация', 'Право', 'Система', 'Переводы',
    ]);
    const hrefs = SECTIONS.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of BEFORE) expect(hrefs).toContain(h);
  });

  it('shows a moderator only their own tabs and hides empty sections', () => {
    const mod = { role: 'moderator' as const, permissions: { moderation: 'manage' as const, content: 'view' as const } };
    expect(groupsFor(mod).map((g) => g.key)).toEqual(['home', 'content', 'system']);
    expect(tabsFor(mod, '/moderation').map((t) => t.href)).toEqual([
      '/moderation', '/media-moderation', '/review-appeals', '/moderation-appeals', '/moderation-journal', '/content', '/legal-qa', '/group-chats', '/practice-areas', '/document-templates', '/form-templates',
    ]);
    // Document forms follow the API: super admin and moderators only.
    expect(canOpen(mod, '/form-templates')).toBe(true);
    expect(canOpen({ role: 'support' as const, permissions: { content: 'manage' as const } }, '/form-templates')).toBe(false);
    // Same section, tab without the right: not shown, URL answers 404.
    expect(canOpen(mod, '/sanctions')).toBe(false);
    expect(canOpen(mod, '/media')).toBe(false);
    expect(tabsFor(mod, '/money')).toEqual([]);
    expect(canOpen(mod, '/payments')).toBe(false);
    // System shows only «Поиск» (content right).
    expect(tabsFor(mod, '/search').map((t) => t.href)).toEqual(['/search']);
  });

  it('gives everyone a workspace; the dashboard tab follows its right', () => {
    const v = { role: 'verifier' as const, permissions: { verification: 'manage' as const } };
    expect(canOpen(v, '/workspace')).toBe(true);
    expect(canOpen(v, '/')).toBe(false);
    expect(groupsFor(v)[0].items.map((s) => s.href)).toEqual(['/workspace']);
    expect(groupFor('/verification/abc')?.key).toBe('people');
  });

  it('keeps owner-only tabs owner-only', () => {
    const deputy = { role: 'support' as const, permissions: {}, canManageAdmins: true };
    expect(canOpen(deputy, '/audit-log')).toBe(false);
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
    for (const h of ['/payments', '/subscriptions', '/promo-codes', '/partners', '/treasury']) {
      expect(canOpen(acc, h)).toBe(true);
    }
    for (const h of ['/prices', '/plans', '/analytics', '/case-payments', '/country-partners', '/sessions', '/integrations', '/admins', '/audit-log', '/flags', '/payroll', '/exports', '/config', '/economy']) {
      expect(canOpen(acc, h)).toBe(false);
    }
  });
  it('the audit log is hidden even with the toggle (owner-only since 2026-10-25)', () => {
    const mod = { role: 'moderator' as const, permissions: { moderation: 'manage' as const } };
    expect(canOpen(mod, '/audit-log')).toBe(false);
    expect(canOpen({ ...mod, permissions: { audit: 'view' as const } }, '/audit-log')).toBe(false);
  });
  it('Настройки and Функции are owner-only, even for budget caps', () => {
    const b = { role: 'support' as const, permissions: { budget_limits: 'manage' as const, settings: 'manage' as const } };
    expect(canOpen(b, '/config')).toBe(false);
    expect(canOpen(b, '/flags')).toBe(false);
    expect(canOpen(b, '/storage')).toBe(true);
  });
  it('the deputy no longer sees owner-only money pages, but reads the shared ones', () => {
    const deputy = { role: 'support' as const, permissions: {}, canManageAdmins: true };
    for (const h of ['/prices', '/analytics', '/sessions', '/admins']) expect(canOpen(deputy, h)).toBe(false);
    for (const h of ['/payments', '/users']) expect(canOpen(deputy, h)).toBe(true);
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

// Owner 2026-10-25 (ADM-NAV): role x page -> visible/openable, every page.
describe('role x page visibility table', () => {
  const full = (v: 'view' | 'manage') =>
    Object.fromEntries(GRANTABLE_AREAS.map((a) => [a.key, v])) as Record<string, 'view' | 'manage'>;
  const roles = {
    super_admin: { role: 'super_admin' as const, permissions: {} },
    deputy: { role: 'support' as const, permissions: {}, canManageAdmins: true },
    moderator: { role: 'moderator' as const, permissions: { dashboard: 'view' as const, moderation: 'manage' as const, content: 'manage' as const, media: 'manage' as const } },
    support: { role: 'support' as const, permissions: { dashboard: 'view' as const, support: 'manage' as const, users: 'view' as const } },
    finance: { role: 'finance' as const, permissions: { dashboard: 'view' as const, money: 'manage' as const, payroll: 'manage' as const, exports: 'view' as const } },
    allToggles: { role: 'support' as const, permissions: full('manage') },
  };
  const ownerOnly = SECTIONS.filter((s) => s.ownerOnly).map((s) => s.href);

  it('owner-only pages are exactly the intended set', () => {
    expect(ownerOnly.sort()).toEqual([
      '/admins', '/analytics', '/audit-log', '/case-payments', '/config', '/country-partners', '/economy', '/flags',
      '/growth-plan', '/guides', '/integrations', '/launch', '/plans', '/prices', '/rewards', '/scale', '/sessions',
      '/spend', '/stars', '/status-page', '/system-health',
    ]);
  });

  it('the super admin opens and sees every page', () => {
    for (const s of SECTIONS) {
      if (s.area === 'partner') continue;
      expect(canOpen(roles.super_admin, s.href), s.href).toBe(true);
      expect(tabsFor(roles.super_admin, s.href).map((t) => t.href), s.href).toContain(s.href);
    }
  });

  it.each(Object.keys(roles).filter((r) => r !== 'super_admin'))('%s: owner-only pages are neither openable nor in the menu', (name) => {
    const me = roles[name as keyof typeof roles];
    const menu = groupsFor(me).flatMap((g) => g.items.map((s) => s.href));
    for (const h of ownerOnly) {
      expect(canOpen(me, h), `${name} ${h}`).toBe(false);
      expect(menu, `${name} ${h}`).not.toContain(h);
    }
  });

  it('menu and canOpen agree for every role and page', () => {
    for (const me of Object.values(roles)) {
      const menu = new Set(groupsFor(me).flatMap((g) => g.items.map((s) => s.href)));
      for (const s of SECTIONS) expect(menu.has(s.href), s.href).toBe(canOpen(me, s.href));
    }
  });

  const expectVisible: Record<string, string[]> = {
    moderator: ['/', '/workspace', '/moderation', '/media-moderation', '/review-appeals', '/moderation-appeals', '/moderation-journal', '/content', '/media', '/legal-qa', '/group-chats', '/practice-areas', '/document-templates', '/form-templates', '/search'],
    support: ['/', '/workspace', '/users', '/support'],
    finance: ['/', '/workspace', '/subscriptions', '/payments', '/promo-codes', '/referrals', '/partners', '/contracts', '/promotions', '/treasury', '/payroll', '/exports', '/pnl'],
  };
  it.each(Object.keys(expectVisible))('%s sees exactly their pages', (name) => {
    const me = roles[name as keyof typeof roles];
    const menu = groupsFor(me).flatMap((g) => g.items.map((s) => s.href));
    expect(menu.sort()).toEqual([...expectVisible[name]].sort());
  });

  it('a country partner lead still reaches /admins for their own team', () => {
    const lead = { role: 'support' as const, countryPartnerId: 'p1', partnerLead: true, permissions: { users: 'view' as const } };
    expect(canOpen(lead, '/admins')).toBe(true);
    expect(canOpen({ ...lead, partnerLead: false }, '/admins')).toBe(false);
  });
});
