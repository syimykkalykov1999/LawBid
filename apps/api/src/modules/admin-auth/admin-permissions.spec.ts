import {
  effectiveCountries,
  readCountries,
  canAccess,
  covers,
  intersect,
  parsePermissions,
  readManageAdmins,
  routeArea,
  storePermissions,
} from './admin-permissions';

describe('admin permissions', () => {
  it('maps routes to areas and closes unknown ones', () => {
    expect(routeArea('/api/v1/admin/client-badges/bulk-approve')).toBe(
      'verification',
    );
    expect(routeArea('/api/v1/admin/contact-issues')).toBe('support');
    expect(routeArea('/api/v1/admin/users/abc/warn')).toBe('users');
    expect(routeArea('/api/v1/admin/billing/payments?x=1')).toBe('money');
    expect(routeArea('/api/v1/admin/integrations')).toBe('keys');
    expect(routeArea('/api/v1/admin/brand-new-thing')).toBe('unknown');
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
      '/api/v1/admin/partners',
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

  it('admin management is closed unless the super admin gave that right', () => {
    const p = '/api/v1/admin/admins/abc/credentials';
    expect(canAccess('support', {}, p, 'PUT')).toBe(false);
    expect(canAccess('support', {}, p, 'PUT', true)).toBe(true);
    expect(canAccess('support', {}, '/api/v1/admin/admins', 'GET', true)).toBe(
      true,
    );
    // Owner 2026-10-05: the trusted deputy reads every section (money,
    // sessions…) but never the keys or an unknown route, and writes only
    // where a toggle says so.
    for (const read of [
      '/api/v1/admin/billing/payments',
      '/api/v1/admin/sessions',
      '/api/v1/admin/cases',
    ]) {
      expect(canAccess('support', {}, read, 'GET', true)).toBe(true);
      expect(canAccess('support', {}, read, 'POST', true)).toBe(false);
    }
    for (const closed of [
      '/api/v1/admin/integrations',
      '/api/v1/admin/brand-new-thing',
    ]) {
      expect(canAccess('support', {}, closed, 'GET', true)).toBe(false);
    }
    // Owner 2026-10-05: the deputy reads the audit log and runs payroll.
    const audit = '/api/v1/admin/audit-log';
    expect(canAccess('support', {}, audit, 'GET', true)).toBe(true);
    expect(canAccess('support', {}, audit, 'POST', true)).toBe(false);
    expect(canAccess('support', {}, audit, 'GET')).toBe(false);
    const payroll = '/api/v1/admin/payroll/payouts/bulk';
    expect(canAccess('support', {}, payroll, 'POST', true)).toBe(true);
    expect(canAccess('support', {}, payroll, 'POST')).toBe(false);
    expect(canAccess('finance', { payroll: 'manage' }, payroll, 'POST')).toBe(
      true,
    );
    expect(canAccess('finance', { payroll: 'view' }, payroll, 'POST')).toBe(
      false,
    );
  });

  it('keeps the manager right next to the areas and only reads a real true', () => {
    expect(storePermissions({ users: 'view' }, true)).toEqual({
      users: 'view',
      manage_admins: true,
    });
    expect(storePermissions({ users: 'view' }, false)).toEqual({
      users: 'view',
    });
    expect(readManageAdmins({ manage_admins: true })).toBe(true);
    expect(readManageAdmins({ manage_admins: 'yes' })).toBe(false);
    expect(readManageAdmins(null)).toBe(false);
    // The right is not an area: parsePermissions never returns it.
    expect(parsePermissions({ manage_admins: true, users: 'view' })).toEqual({
      users: 'view',
    });
  });

  it('covers() and intersect() cap a grant at what the granter holds', () => {
    const mine = parsePermissions({ users: 'manage', support: 'view' });
    expect(covers(mine, parsePermissions({ users: 'view' }))).toBe(true);
    expect(covers(mine, parsePermissions({ support: 'manage' }))).toBe(false);
    expect(covers(mine, parsePermissions({ cases: 'view' }))).toBe(false);
    expect(covers(mine, {})).toBe(true);
    expect(
      intersect(
        mine,
        parsePermissions({ users: 'manage', support: 'manage', cases: 'view' }),
      ),
    ).toEqual({ users: 'manage', support: 'view' });
  });
});

describe('plan prices (owner 2026-10-03: super admin only)', () => {
  it('no other admin reaches /admin/billing/prices, whatever its toggles', () => {
    const all = { money: 'manage' } as unknown as Parameters<
      typeof canAccess
    >[1];
    for (const role of [
      'finance',
      'support',
      'moderator',
      'verifier',
    ] as const) {
      expect(canAccess(role, all, '/api/v1/admin/billing/prices', 'GET')).toBe(
        false,
      );
      expect(
        canAccess(role, all, '/api/v1/admin/billing/prices/monthly', 'PUT'),
      ).toBe(false);
    }
    expect(
      canAccess(
        'super_admin',
        {},
        '/api/v1/admin/billing/prices/monthly',
        'PUT',
      ),
    ).toBe(true);
  });
});

describe('countries of an employee (owner 2026-10-05)', () => {
  it('reads assigned countries, dropping junk', () => {
    expect(readCountries({ countries: ['CA', 'US', 'CA', 'x', 5] })).toEqual([
      'CA',
      'US',
    ]);
    expect(readCountries({ users: 'view' })).toEqual([]);
    expect(readCountries(null)).toEqual([]);
  });

  it('keeps countries when the areas are stored again', () => {
    expect(storePermissions({ users: 'view' }, false, ['CA'])).toEqual({
      users: 'view',
      countries: ['CA'],
    });
    expect(storePermissions({ users: 'view' }, false)).toEqual({
      users: 'view',
    });
  });

  it('owner and unassigned staff see every country unless a tab is picked', () => {
    expect(effectiveCountries(true, [], undefined)).toBeNull();
    expect(effectiveCountries(false, [], undefined)).toBeNull();
    expect(effectiveCountries(true, [], 'ca')).toEqual(['CA']);
    expect(effectiveCountries(false, [], 'MX')).toEqual(['MX']);
  });

  it('a country employee never leaves their countries', () => {
    expect(effectiveCountries(false, ['CA'], undefined)).toEqual(['CA']);
    expect(effectiveCountries(false, ['CA', 'MX'], 'MX')).toEqual(['MX']);
    // A tab outside their countries is ignored.
    expect(effectiveCountries(false, ['CA'], 'US')).toEqual(['CA']);
    expect(effectiveCountries(false, ['CA'], 'garbage')).toEqual(['CA']);
  });
});
