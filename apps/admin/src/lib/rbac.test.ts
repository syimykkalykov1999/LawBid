import { describe, expect, it } from 'vitest';
import { GROUPS, SECTIONS, canOpen, groupFor, groupsFor, tabsFor } from './rbac';

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
      '/moderation', '/review-appeals', '/content', '/document-templates', '/search',
    ]);
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
