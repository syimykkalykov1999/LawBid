import { describe, expect, it } from 'vitest';
import {
  DESK_PAGES,
  DESK_ROLES,
  DESK_TABS,
  deskAccess,
  deskHome,
  desksFor,
  outsideDesk,
  ownDeskRole,
  tabKeyOrFirst,
  tabsFor,
  type DeskRole,
} from './desk';
import { SECTIONS, type AdminRole, type AdminWorkspace } from './rbac';

type Subject = Parameters<typeof deskAccess>[0];
const who = (role: AdminRole, over: Partial<NonNullable<Subject>> = {}): NonNullable<Subject> => ({
  role,
  workspacesEnabled: true,
  workspace: role === 'finance' ? 'finance' : 'mass',
  ...over,
});

describe('desk tabs (owner list)', () => {
  it('verifier, moderator, support and finance have exactly the agreed tabs', () => {
    const labels = (r: DeskRole) => DESK_TABS[r].map((t) => t.label);
    expect(labels('verifier')).toEqual(['Очередь', 'Мои', 'Проверено', 'Мой рейтинг']);
    expect(labels('moderator')).toEqual(['Жалобы', 'Обжалования', 'Мои', 'Мой рейтинг']);
    expect(labels('support')).toEqual(['Обращения', 'Чаты', 'Мои', 'Мой рейтинг']);
    expect(labels('finance')).toEqual(['Выплаты', 'Возвраты', 'Отчёты', 'Мои задачи']);
  });

  it('an unknown ?tab= falls back to the first tab', () => {
    expect(tabKeyOrFirst('support', 'nope')).toBe('tickets');
    expect(tabKeyOrFirst('support', 'chats')).toBe('chats');
    expect(tabKeyOrFirst('support', null)).toBe('tickets');
  });

  it('a head or the owner who only looks gets the queues and «Команда», not the personal tabs', () => {
    expect(tabsFor('verifier', 'view').map((t) => t.key)).toEqual(['queue', 'team']);
    expect(tabsFor('finance', 'view').map((t) => t.key)).toEqual(['payouts', 'refunds', 'reports', 'team']);
    // a personal tab asked from the address bar is not honoured in view mode
    expect(tabKeyOrFirst('moderator', 'rating', 'view')).toBe('reports');
  });
});

describe('who may open which desk', () => {
  it('everything is closed while the workspaces or the desk switch are off', () => {
    for (const r of DESK_ROLES) {
      expect(deskAccess(who('support', { workspacesEnabled: false }), r, true)).toBeNull();
      expect(deskAccess(who('support'), r, false)).toBeNull();
      expect(deskAccess(who('super_admin', { workspace: 'owner' }), r, false)).toBeNull();
    }
    expect(deskHome(who('support'), false)).toBeNull();
    expect(outsideDesk(who('support'), '/outreach', false)).toBe(false);
  });

  it('a worker opens only their own desk', () => {
    expect(deskAccess(who('verifier'), 'verifier', true)).toBe('own');
    expect(deskAccess(who('verifier'), 'moderator', true)).toBeNull();
    expect(deskAccess(who('support'), 'finance', true)).toBeNull();
    expect(deskAccess(who('finance'), 'finance', true)).toBe('own');
    expect(deskAccess(who('finance'), 'support', true)).toBeNull();
  });

  it('a role that does not fit the workspace has no desk', () => {
    expect(ownDeskRole(who('finance', { workspace: 'mass' as AdminWorkspace }))).toBeNull();
    expect(ownDeskRole(who('support', { workspace: 'finance' as AdminWorkspace }))).toBeNull();
  });

  it('the head of mass works their own desk and looks at the other mass desks, never at finance', () => {
    const head = who('moderator', { workspaceHead: true });
    expect(deskAccess(head, 'moderator', true)).toBe('own');
    expect(deskAccess(head, 'verifier', true)).toBe('view');
    expect(deskAccess(head, 'support', true)).toBe('view');
    expect(deskAccess(head, 'finance', true)).toBeNull();
  });

  it('the owner looks at all four, never works one; the deputy and a partner team have none', () => {
    const owner = who('super_admin', { workspace: 'owner' });
    expect(DESK_ROLES.map((r) => deskAccess(owner, r, true))).toEqual(['view', 'view', 'view', 'view']);
    expect(deskHome(owner, true)).toBeNull();
    expect(deskAccess(who('support', { canManageAdmins: true }), 'support', true)).toBeNull();
    expect(deskAccess(who('support', { countryPartnerId: 'p1' }), 'support', true)).toBeNull();
  });

  it('desksFor lists the own desk first', () => {
    const head = who('support', { workspaceHead: true });
    expect(desksFor(head, true)[0]).toEqual({ role: 'support', mode: 'own' });
    expect(desksFor(head, true).map((d) => d.role).sort()).toEqual(['moderator', 'support', 'verifier']);
    expect(deskHome(head, true)).toBe('/desk/support');
  });
});

describe('what stays reachable besides the desk', () => {
  it('only the pages the desk composes (and their cards) plus the profile', () => {
    const w = who('support');
    expect(outsideDesk(w, '/support/abc', true)).toBe(false);
    expect(outsideDesk(w, '/users/42', true)).toBe(false);
    expect(outsideDesk(w, '/profile', true)).toBe(false);
    expect(outsideDesk(w, '/desk/support', true)).toBe(false);
    expect(outsideDesk(w, '/outreach', true)).toBe(true);
    expect(outsideDesk(w, '/verification', true)).toBe(true);
    expect(outsideDesk(w, '/content', true)).toBe(true);
  });

  it('the head also keeps the team page', () => {
    expect(outsideDesk(who('support', { workspaceHead: true }), '/admins', true)).toBe(false);
  });

  it('the owner and the deputy are never limited by the desk', () => {
    expect(outsideDesk(who('super_admin', { workspace: 'owner' }), '/payments', true)).toBe(false);
    expect(outsideDesk(who('support', { canManageAdmins: true }), '/payments', true)).toBe(false);
  });

  it('every kept page is a real section of the admin', () => {
    const hrefs = new Set(SECTIONS.map((s) => s.href));
    for (const list of Object.values(DESK_PAGES)) for (const h of list) expect(hrefs.has(h), h).toBe(true);
  });
});
