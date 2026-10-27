import {
  ADMIN_AREAS,
  WORKSPACE_MAX,
  canAccess,
  capToWorkspace,
  outsideWorkspace,
  workspaceCeiling,
  type AdminPermissions,
} from './admin-permissions';
import { WORKSPACE_AREAS } from '../staff-core/workspace-scope';

/**
 * Staff package T2 (plan C3): the per-workspace ceilings. An admin can
 * never be granted a section outside their workspace; the ceiling is
 * built from the very lists the guard answers 404 for, so the two cannot
 * drift apart.
 */
describe('WORKSPACE_MAX (ceilings)', () => {
  it('has exactly the areas the guard lets the workspace reach', () => {
    for (const ws of ['mass', 'finance'] as const) {
      expect(Object.keys(WORKSPACE_MAX[ws]).sort()).toEqual(
        [...WORKSPACE_AREAS[ws]].sort(),
      );
      // every listed area is a real, grantable area key
      for (const a of WORKSPACE_AREAS[ws]) {
        expect(ADMIN_AREAS as readonly string[]).toContain(a);
      }
    }
  });

  it('keeps the owner-only sections out of every workspace', () => {
    const ownerOnly = [
      'settings',
      'legal',
      'data_requests',
      'exports',
      'localization',
      'broadcasts',
      'email_templates',
      'audit',
      'partner_report',
      'promotion',
    ];
    for (const ws of ['mass', 'finance'] as const) {
      for (const a of ownerOnly) {
        expect(WORKSPACE_MAX[ws]).not.toHaveProperty(a);
      }
    }
  });

  it('mass is queues and people: no money, payroll, economy or budget caps', () => {
    for (const a of ['money', 'economy', 'budget_limits', 'payroll']) {
      expect(WORKSPACE_MAX.mass).not.toHaveProperty(a);
    }
    expect(WORKSPACE_MAX.mass.verification).toBe('manage');
    expect(WORKSPACE_MAX.mass.support).toBe('manage');
    // the people list and the dashboard are read only
    expect(WORKSPACE_MAX.mass.users).toBe('view');
    expect(WORKSPACE_MAX.mass.dashboard).toBe('view');
  });

  it('finance is money, payroll, economy and budget limits: no queues', () => {
    for (const a of ['verification', 'moderation', 'support', 'users']) {
      expect(WORKSPACE_MAX.finance).not.toHaveProperty(a);
    }
    expect(WORKSPACE_MAX.finance.payroll).toBe('manage');
    expect(WORKSPACE_MAX.finance.money).toBe('manage');
    expect(WORKSPACE_MAX.finance.budget_limits).toBe('manage');
  });

  it('the owner workspace has no ceiling; the others get a copy', () => {
    expect(workspaceCeiling('owner')).toBeNull();
    const c = workspaceCeiling('mass');
    expect(c).toEqual(WORKSPACE_MAX.mass);
    (c as AdminPermissions).support = 'view';
    expect(WORKSPACE_MAX.mass.support).toBe('manage');
  });

  it('outsideWorkspace names the sections that do not fit, level included', () => {
    expect(
      outsideWorkspace('mass', { support: 'manage', verification: 'view' }),
    ).toEqual([]);
    expect(
      outsideWorkspace('mass', { payroll: 'manage', support: 'manage' }),
    ).toEqual(['payroll']);
    // `manage` of a read-only area is out, `view` is in
    expect(outsideWorkspace('mass', { users: 'manage' })).toEqual(['users']);
    expect(outsideWorkspace('mass', { users: 'view' })).toEqual([]);
    expect(outsideWorkspace('finance', { support: 'view' })).toEqual([
      'support',
    ]);
    expect(
      outsideWorkspace('owner', { payroll: 'manage', keys: 1 } as never),
    ).toEqual([]);
  });

  it('capToWorkspace cuts sections and levels to the ceiling', () => {
    expect(
      capToWorkspace('mass', {
        users: 'manage',
        support: 'manage',
        payroll: 'manage',
        exports: 'view',
      }),
    ).toEqual({ users: 'view', support: 'manage' });
    expect(capToWorkspace('owner', { payroll: 'manage' })).toEqual({
      payroll: 'manage',
    });
  });
});

describe('canAccess: the admins page for a workspace head', () => {
  const perms: AdminPermissions = { verification: 'manage' };
  const path = '/api/v1/admin/admins';

  it('is closed to a plain worker and to a head whose role is off', () => {
    expect(canAccess('verifier', perms, path, 'GET')).toBe(false);
    expect(
      canAccess('verifier', perms, path, 'GET', false, null, false, false),
    ).toBe(false);
  });

  it('is open to a head (the guard passes the flag only while the head role is on)', () => {
    expect(
      canAccess('verifier', perms, path, 'POST', false, null, false, true),
    ).toBe(true);
  });

  it('a head gets nothing else from the flag: keys, sessions, audit stay closed', () => {
    for (const p of [
      '/api/v1/admin/integrations',
      '/api/v1/admin/sessions',
      '/api/v1/admin/audit-log',
      '/api/v1/admin/billing/payments',
    ]) {
      expect(
        canAccess('verifier', perms, p, 'GET', false, null, false, true),
      ).toBe(false);
    }
  });

  it('does not change the deputy or the owner', () => {
    expect(canAccess('support', {}, path, 'GET', true)).toBe(true);
    expect(canAccess('super_admin', {}, path, 'DELETE')).toBe(true);
  });
});
