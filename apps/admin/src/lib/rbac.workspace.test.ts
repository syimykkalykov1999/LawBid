import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRANTABLE_AREAS, GROUPED, GROUPS, SECTIONS, WORKSPACE_AREAS, WORKSPACE_VIEW_ONLY, canOpen, deskTabsFor, fitToMe, groupFor, groupsFor, navModeFor, tabsFor, workspaceCeiling } from './rbac';
import { NAV_GROUP_META, NAV_PLACE } from './nav-groups';

// Staff package T2: the owner's menu in eight groups, the desk for workers,
// and the unchanged old menu while `staff.workspaces_enabled` is off.
const owner = { role: 'super_admin' as const, permissions: {} };
const ownerOn = { ...owner, workspacesEnabled: true, workspace: 'owner' as const };
const mass = {
  role: 'verifier' as const,
  permissions: { dashboard: 'view' as const, verification: 'manage' as const, support: 'manage' as const, users: 'view' as const, money: 'view' as const, settings: 'view' as const },
  workspace: 'mass' as const,
};
const finance = {
  role: 'finance' as const,
  permissions: { dashboard: 'view' as const, money: 'manage' as const, payroll: 'manage' as const, verification: 'view' as const, exports: 'view' as const },
  workspace: 'finance' as const,
};
const head = { ...mass, workspaceHead: true, workspacesEnabled: true };

const hrefs = (g: readonly { items: readonly { href: string }[] }[]) => g.flatMap((x) => x.items.map((s) => s.href));

describe('switch off (the default): the admin is exactly as before', () => {
  it('everybody gets the old menu, whatever workspace the server reports', () => {
    for (const me of [owner, { ...mass, workspacesEnabled: false }, { ...finance, workspacesEnabled: false }, mass]) {
      expect(navModeFor(me)).toBe('classic');
    }
    expect(groupsFor(owner).map((g) => g.label)).toEqual(GROUPS.map((g) => g.label));
    expect(groupsFor({ ...mass, workspacesEnabled: false }).map((g) => g.key)).toEqual(groupsFor({ role: mass.role, permissions: mass.permissions }).map((g) => g.key));
  });

  it('a mass admin with a money toggle still sees the money pages when off', () => {
    expect(canOpen({ ...mass, workspacesEnabled: false }, '/payments')).toBe(true);
    expect(canOpen({ ...mass, workspacesEnabled: false }, '/storage')).toBe(true);
  });

  it('the head flag opens nothing when off', () => {
    expect(canOpen({ ...mass, workspaceHead: true, workspacesEnabled: false }, '/admins')).toBe(false);
  });
});

describe('switch on: the owner keeps every section, grouped in eight', () => {
  it('has the eight groups of the plan in order', () => {
    expect(NAV_GROUP_META.map((g) => g.label)).toEqual([
      'Сегодня',
      'Очереди',
      'Люди и кейсы',
      'Контент и тексты',
      'Деньги',
      'Команда и контроль',
      'Система',
      'Запуск и право',
    ]);
    expect(navModeFor(ownerOn)).toBe('grouped');
    expect(groupsFor(ownerOn).map((g) => g.label)).toEqual(NAV_GROUP_META.map((g) => g.label));
  });

  it('nothing is removed: the same pages, each exactly once, only regrouped', () => {
    const before = SECTIONS.map((s) => s.href).sort();
    const after = hrefs(GROUPED).sort();
    expect(after).toEqual(before);
    expect(new Set(after).size).toBe(after.length);
    expect(hrefs(groupsFor(ownerOn)).sort()).toEqual(hrefs(groupsFor(owner)).sort());
  });

  it('every page is placed on purpose (a new page must be added to nav-groups.ts)', () => {
    for (const s of SECTIONS) expect(NAV_PLACE[s.href], s.href).toBeDefined();
  });

  it('follows the research table (§4.3) for the pages it names', () => {
    const where = (href: string) => groupFor(href, ownerOn)?.label;
    expect(where('/')).toBe('Сегодня');
    expect(where('/support')).toBe('Очереди');
    expect(where('/moderation-appeals')).toBe('Очереди');
    expect(where('/cases')).toBe('Люди и кейсы');
    expect(where('/outreach')).toBe('Люди и кейсы');
    expect(where('/email-templates')).toBe('Контент и тексты');
    expect(where('/payroll')).toBe('Деньги');
    expect(where('/analytics')).toBe('Деньги');
    expect(where('/admins')).toBe('Команда и контроль');
    expect(where('/moderation-journal')).toBe('Команда и контроль');
    expect(where('/system-health')).toBe('Система');
    expect(where('/exports')).toBe('Система');
    expect(where('/legal-documents')).toBe('Запуск и право');
    expect(where('/data-requests')).toBe('Запуск и право');
  });

  it('tabs inside a group are its pages in order', () => {
    expect(tabsFor(ownerOn, '/support').map((t) => t.href).slice(0, 5)).toEqual(['/verification', '/verification/trust', '/client-badges', '/support', '/moderation']);
  });

  it('a page nobody placed would join «Система», never vanish', () => {
    const system = GROUPED.find((g) => g.key === 'system')!;
    expect(system.items.length).toBeGreaterThan(0);
  });
});

describe('switch on: a worker of mass / finance gets the desk', () => {
  it('is desk mode for mass and finance, also for the head; the deputy and a partner team stay classic', () => {
    expect(navModeFor({ ...mass, workspacesEnabled: true })).toBe('desk');
    expect(navModeFor({ ...finance, workspacesEnabled: true })).toBe('desk');
    expect(navModeFor(head)).toBe('desk');
    expect(navModeFor({ ...mass, workspacesEnabled: true, canManageAdmins: true })).toBe('classic');
    expect(navModeFor({ ...mass, workspacesEnabled: true, countryPartnerId: 'p1' })).toBe('classic');
  });

  it('tabs hold only the pages of their own workspace, their workspace page first', () => {
    const m = { ...mass, workspacesEnabled: true };
    const tabs = deskTabsFor(m).map((t) => t.href);
    expect(tabs[0]).toBe('/workspace');
    expect(tabs).toEqual(expect.arrayContaining(['/', '/verification', '/support', '/users']));
    // another workspace and the owner's pages are not there, toggles or not
    for (const h of ['/payments', '/subscriptions', '/storage', '/crashes', '/audit-log', '/integrations', '/admins', '/exports']) {
      expect(tabs, h).not.toContain(h);
      expect(canOpen(m, h), h).toBe(false);
    }
    const f = deskTabsFor({ ...finance, workspacesEnabled: true }).map((t) => t.href);
    expect(f).toEqual(expect.arrayContaining(['/workspace', '/payments', '/payroll', '/treasury']));
    for (const h of ['/verification', '/support', '/exports', '/users']) expect(f, h).not.toContain(h);
  });

  it('a typed URL of another workspace is "not found" even with the toggle', () => {
    const m = { ...mass, workspacesEnabled: true };
    expect(canOpen(m, '/payments')).toBe(false);
    expect(canOpen(m, '/verification')).toBe(true);
    expect(canOpen(m, '/workspace')).toBe(true);
  });

  it('menu, palette and tabs agree: every desk tab opens, every opening page is a tab', () => {
    for (const me of [{ ...mass, workspacesEnabled: true }, { ...finance, workspacesEnabled: true }, head]) {
      const tabs = new Set(deskTabsFor(me).map((t) => t.href));
      for (const s of SECTIONS) expect(tabs.has(s.href), `${me.workspace} ${s.href}`).toBe(canOpen(me, s.href));
    }
  });

  it('the page «Администраторы» opens only for the head', () => {
    expect(canOpen({ ...mass, workspacesEnabled: true }, '/admins')).toBe(false);
    expect(canOpen(head, '/admins')).toBe(true);
    expect(deskTabsFor(head).map((t) => t.href)).toContain('/admins');
    expect(deskTabsFor({ ...mass, workspacesEnabled: true }).map((t) => t.href)).not.toContain('/admins');
  });
});

describe('ceilings and parity with the API', () => {
  const api = readFileSync(path.resolve(__dirname, '../../../api/src/modules/staff-core/workspace-scope.ts'), 'utf8');
  const perms = readFileSync(path.resolve(__dirname, '../../../api/src/modules/admin-auth/admin-permissions.ts'), 'utf8');
  const listOf = (name: string) => {
    const m = new RegExp(`${name}: \\[([^\\]]*)\\]`).exec(api);
    return [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  };

  it('WORKSPACE_AREAS is the API list (workspace-scope.ts)', () => {
    expect(WORKSPACE_AREAS.mass).toEqual(listOf('mass'));
    expect(WORKSPACE_AREAS.finance).toEqual(listOf('finance'));
  });

  it('read-only areas are the API caps (admin-permissions.ts)', () => {
    const block = /WORKSPACE_LEVEL_CAP[^{]*\{([^}]*)\}/.exec(perms)?.[1] ?? '';
    const capped = [...block.matchAll(/([a-z_]+): 'view'/g)].map((x) => x[1]).sort();
    expect([...WORKSPACE_VIEW_ONLY].sort()).toEqual(capped);
  });

  it('every ceiling area is a grantable area key', () => {
    const keys = GRANTABLE_AREAS.map((a) => a.key);
    for (const a of [...WORKSPACE_AREAS.mass, ...WORKSPACE_AREAS.finance]) expect(keys, a).toContain(a);
  });

  it('mass has no money, finance has no queues, owner has no ceiling', () => {
    expect(workspaceCeiling('mass')).not.toHaveProperty('payroll');
    expect(workspaceCeiling('mass')?.verification).toBe('manage');
    expect(workspaceCeiling('mass')?.users).toBe('view');
    expect(workspaceCeiling('finance')?.payroll).toBe('manage');
    expect(workspaceCeiling('finance')).not.toHaveProperty('verification');
    expect(workspaceCeiling('owner')).toBeNull();
  });

  it('a head hands out up to the ceiling of their workspace, never money', () => {
    const out = fitToMe({ verification: 'manage', support: 'view', users: 'manage', payroll: 'manage', money: 'view', settings: 'view' }, head);
    expect(out).toEqual({ verification: 'manage', support: 'view', users: 'view' });
  });
});
