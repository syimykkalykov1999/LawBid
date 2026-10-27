import {
  WORKSPACE_AREAS,
  effectiveWorkspace,
  workspaceAllows,
} from './workspace-scope';

describe('workspace scope (staff package T1, plan C3)', () => {
  const mass = {
    role: 'verifier' as const,
    workspace: 'mass' as const,
    deputy: false,
    partner: false,
  };
  const fin = {
    role: 'finance' as const,
    workspace: 'finance' as const,
    deputy: false,
    partner: false,
  };

  it('the super admin is always the owner', () => {
    expect(effectiveWorkspace('super_admin', 'mass')).toBe('owner');
    expect(effectiveWorkspace('verifier', null)).toBe('mass');
    expect(effectiveWorkspace('finance', 'finance')).toBe('finance');
  });

  it('mass never reaches money, keys, settings, audit, exports or legal requests', () => {
    for (const a of [
      'money',
      'economy',
      'budget_limits',
      'payroll',
      'keys',
      'settings',
      'audit',
      'exports',
      'data_requests',
      'admins',
      'unknown',
    ]) {
      expect(workspaceAllows(mass, a)).toBe(false);
    }
    expect(workspaceAllows(mass, 'verification')).toBe(true);
  });

  it('finance reaches money and payroll, not the mass queues', () => {
    expect(workspaceAllows(fin, 'money')).toBe(true);
    expect(workspaceAllows(fin, 'payroll')).toBe(true);
    expect(workspaceAllows(fin, 'verification')).toBe(false);
    expect(workspaceAllows(fin, 'support')).toBe(false);
  });

  it('sign-in, the own workspace page and non-admin routes stay open', () => {
    for (const w of [mass, fin]) {
      expect(workspaceAllows(w, 'auth')).toBe(true);
      expect(workspaceAllows(w, 'workspace')).toBe(true);
      expect(workspaceAllows(w, null)).toBe(true);
    }
  });

  it('owner, deputy and a partner team are not limited', () => {
    expect(workspaceAllows({ ...mass, workspace: 'owner' }, 'money')).toBe(
      true,
    );
    expect(workspaceAllows({ ...mass, deputy: true }, 'money')).toBe(true);
    expect(workspaceAllows({ ...mass, partner: true }, 'money')).toBe(true);
    expect(workspaceAllows({ ...mass, role: 'super_admin' }, 'keys')).toBe(
      true,
    );
  });

  it('no area sits in both mass and finance except the shared dashboard / on-call', () => {
    const both = WORKSPACE_AREAS.mass.filter((a) =>
      WORKSPACE_AREAS.finance.includes(a),
    );
    expect(both.sort()).toEqual(['dashboard', 'on_call']);
  });
});
