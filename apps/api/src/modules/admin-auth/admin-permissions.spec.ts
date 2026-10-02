import { canAccess, parsePermissions, routeArea } from './admin-permissions';

describe('admin permissions', () => {
  it('maps routes to areas and closes unknown ones', () => {
    expect(routeArea('/api/v1/admin/users/abc/warn')).toBe('users');
    expect(routeArea('/api/v1/admin/billing/payments?x=1')).toBe('money');
    expect(routeArea('/api/v1/admin/integrations')).toBe('keys');
    expect(routeArea('/api/v1/admin/brand-new-thing')).toBe('admins');
    expect(routeArea('/api/v1/cases')).toBeNull();
  });

  it('super admin reaches everything', () => {
    expect(
      canAccess('super_admin', {}, '/api/v1/admin/billing/refunds', 'POST'),
    ).toBe(true);
    expect(
      canAccess('super_admin', {}, '/api/v1/admin/integrations', 'PUT'),
    ).toBe(true);
  });

  it('money, keys and admin management are closed whatever the toggles say', () => {
    const all = parsePermissions({
      users: 'manage',
      money: 'manage',
      keys: 'manage',
    });
    for (const p of [
      '/api/v1/admin/billing/payments',
      '/api/v1/admin/subscriptions',
      '/api/v1/admin/promotions',
      '/api/v1/admin/referrals',
      '/api/v1/admin/integrations',
      '/api/v1/admin/admins',
      '/api/v1/admin/audit-log',
      '/api/v1/admin/sessions',
    ]) {
      expect(canAccess('support', all, p, 'GET')).toBe(false);
      expect(canAccess('finance', all, p, 'POST')).toBe(false);
    }
  });

  it('view allows reads only; manage allows writes; no toggle allows nothing', () => {
    const perms = parsePermissions({ support: 'view', users: 'manage' });
    expect(
      canAccess('support', perms, '/api/v1/admin/support/tickets', 'GET'),
    ).toBe(true);
    expect(
      canAccess(
        'support',
        perms,
        '/api/v1/admin/support/tickets/1/messages',
        'POST',
      ),
    ).toBe(false);
    expect(
      canAccess('support', perms, '/api/v1/admin/users/1/suspend', 'POST'),
    ).toBe(true);
    expect(canAccess('support', perms, '/api/v1/admin/cases/1', 'GET')).toBe(
      false,
    );
  });

  it('own-session routes stay open and junk in storage is ignored', () => {
    expect(canAccess('moderator', {}, '/api/v1/admin/auth/me', 'GET')).toBe(
      true,
    );
    expect(
      parsePermissions({ users: 'root', nope: 'manage', cases: 'view' }),
    ).toEqual({
      cases: 'view',
    });
    expect(parsePermissions(null)).toEqual({});
  });
});
