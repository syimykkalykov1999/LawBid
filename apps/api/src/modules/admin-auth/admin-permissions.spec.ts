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
  ADMIN_AREAS,
  ADMIN_PRESETS,
  SUPER_ONLY_AREAS,
  findPreset,
  hasSuperGrantOnly,
  readNoPii,
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

  it('keys, admin management and sessions are closed whatever the toggles say', () => {
    const all = parsePermissions({
      users: 'manage',
      money: 'manage',
      audit: 'manage',
      keys: 'manage',
      admins: 'manage',
      sessions: 'manage',
    });
    for (const p of [
      '/api/v1/admin/integrations',
      '/api/v1/admin/admins',
      '/api/v1/admin/sessions',
      '/api/v1/admin/rewards',
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
  it('no admin without the money toggle reaches /admin/billing/prices', () => {
    const none = { users: 'manage' } as unknown as Parameters<
      typeof canAccess
    >[1];
    for (const role of [
      'finance',
      'support',
      'moderator',
      'verifier',
    ] as const) {
      expect(canAccess(role, none, '/api/v1/admin/billing/prices', 'GET')).toBe(
        false,
      );
      expect(
        canAccess(role, none, '/api/v1/admin/billing/prices/monthly', 'PUT'),
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

describe('grantable money, economy, budget limits, chats, audit (owner 2026-10-16)', () => {
  const base = '/api/v1/admin';

  it('lists the new areas as grantable and keeps the secret ones super-only', () => {
    for (const a of ['money', 'economy', 'budget_limits', 'chats', 'audit']) {
      expect(ADMIN_AREAS as readonly string[]).toContain(a);
    }
    expect([...SUPER_ONLY_AREAS].sort()).toEqual(
      ['admins', 'keys', 'rewards', 'sessions'].sort(),
    );
  });

  it('money: view reads, manage writes, no toggle nothing', () => {
    const v = parsePermissions({ money: 'view' });
    const m = parsePermissions({ money: 'manage' });
    for (const p of [
      `${base}/billing/payments`,
      `${base}/subscriptions/u1`,
      `${base}/partners`,
      `${base}/treasury`,
    ]) {
      expect(canAccess('finance', v, p, 'GET')).toBe(true);
      expect(canAccess('finance', v, p, 'POST')).toBe(false);
      expect(canAccess('finance', m, p, 'POST')).toBe(true);
      expect(canAccess('finance', {}, p, 'GET')).toBe(false);
    }
  });

  it('economy and chats get their own switch', () => {
    expect(routeArea(`${base}/economy`)).toBe('economy');
    expect(routeArea(`${base}/chats/abc`)).toBe('chats');
    const eco = parsePermissions({ economy: 'view' });
    expect(canAccess('finance', eco, `${base}/economy`, 'GET')).toBe(true);
    expect(canAccess('finance', eco, `${base}/economy`, 'PUT')).toBe(false);
    expect(canAccess('finance', eco, `${base}/billing/payments`, 'GET')).toBe(
      false,
    );
    expect(
      canAccess(
        'support',
        parsePermissions({ chats: 'manage' }),
        `${base}/chats`,
        'POST',
      ),
    ).toBe(true);
    expect(canAccess('support', {}, `${base}/chats`, 'GET')).toBe(false);
  });

  it('budget caps are their own switch, apart from Настройки', () => {
    expect(routeArea(`${base}/config/budgets`)).toBe('budget_limits');
    expect(routeArea(`${base}/config/budgets/sms/day?x=1`)).toBe(
      'budget_limits',
    );
    expect(routeArea(`${base}/config`)).toBe('settings');
    expect(routeArea(`${base}/config/budgets-other`)).toBe('settings');
    const settings = parsePermissions({ settings: 'manage' });
    const budgets = parsePermissions({ budget_limits: 'manage' });
    expect(
      canAccess('support', settings, `${base}/config/budgets`, 'PUT'),
    ).toBe(false);
    expect(canAccess('support', settings, `${base}/config`, 'PUT')).toBe(true);
    expect(canAccess('support', budgets, `${base}/config/budgets`, 'PUT')).toBe(
      true,
    );
    expect(canAccess('support', budgets, `${base}/config`, 'GET')).toBe(false);
  });

  it('the audit log opens with its toggle only', () => {
    expect(canAccess('support', {}, `${base}/audit-log`, 'GET')).toBe(false);
    expect(
      canAccess(
        'support',
        parsePermissions({ audit: 'view' }),
        `${base}/audit-log`,
        'GET',
      ),
    ).toBe(true);
  });

  it('only the super admin may hand out money, economy, budget limits or audit', () => {
    expect(hasSuperGrantOnly(parsePermissions({ money: 'view' }))).toBe(true);
    expect(hasSuperGrantOnly(parsePermissions({ audit: 'view' }))).toBe(true);
    expect(hasSuperGrantOnly(parsePermissions({ budget_limits: 'view' }))).toBe(
      true,
    );
    expect(hasSuperGrantOnly(parsePermissions({ economy: 'view' }))).toBe(true);
    expect(
      hasSuperGrantOnly(parsePermissions({ users: 'manage', chats: 'view' })),
    ).toBe(false);
  });
});

describe('«без персональных данных» (owner 2026-10-16)', () => {
  const base = '/api/v1/admin';
  const perms = parsePermissions({
    money: 'view',
    users: 'view',
    exports: 'manage',
    data_requests: 'manage',
  });

  it('is stored, read back and survives re-storing', () => {
    expect(storePermissions({ money: 'view' }, false, [], null, true)).toEqual({
      money: 'view',
      no_pii: true,
    });
    expect(storePermissions({ money: 'view' }, false)).toEqual({
      money: 'view',
    });
    expect(readNoPii({ no_pii: true })).toBe(true);
    expect(readNoPii({ no_pii: 'yes' })).toBe(false);
    expect(readNoPii(null)).toBe(false);
    // The flag never leaks into the area toggles.
    expect(parsePermissions({ no_pii: true, money: 'view' })).toEqual({
      money: 'view',
    });
  });

  it('closes bulk personal-data sections and CSV downloads, keeps the rest', () => {
    for (const p of [
      `${base}/export/users`,
      `${base}/data-requests`,
      `${base}/data-requests/legal/lookup`,
      `${base}/data-requests/legal/users/x`,
      `${base}/data-requests/legal/requests/x/exports`,
      `${base}/partners/commissions/export.csv`,
    ]) {
      expect(canAccess('finance', perms, p, 'GET', false, null, true)).toBe(
        false,
      );
      // Without the flag the same grant reaches them.
      expect(canAccess('finance', perms, p, 'GET', false, null, false)).toBe(
        true,
      );
    }
    expect(
      canAccess('finance', perms, `${base}/users`, 'GET', false, null, true),
    ).toBe(true);
    expect(
      canAccess(
        'finance',
        perms,
        `${base}/billing/payments`,
        'GET',
        false,
        null,
        true,
      ),
    ).toBe(true);
  });

  it('never limits the super admin', () => {
    expect(
      canAccess(
        'super_admin',
        {},
        `${base}/export/users`,
        'GET',
        false,
        null,
        true,
      ),
    ).toBe(true);
  });
});

describe('role presets (owner 2026-10-16)', () => {
  const byKey = (k: string) => {
    const p = findPreset(k);
    if (!p) throw new Error(`no preset ${k}`);
    return p;
  };

  it('has the five presets with valid, clean toggles', () => {
    expect(ADMIN_PRESETS.map((p) => p.key)).toEqual([
      'owner',
      'accountant',
      'moderator',
      'support',
      'viewer',
    ]);
    for (const p of ADMIN_PRESETS) {
      expect(parsePermissions(p.permissions)).toEqual(p.permissions);
    }
    expect(findPreset('nope')).toBeUndefined();
  });

  it('owner is the super admin; only it is dangerous', () => {
    expect(byKey('owner').role).toBe('super_admin');
    expect(ADMIN_PRESETS.filter((p) => p.dangerous).map((p) => p.key)).toEqual([
      'owner',
    ]);
  });

  it('accountant: money, economy and budgets, masked, cannot change money', () => {
    const a = byKey('accountant');
    expect(a.noPii).toBe(true);
    expect(a.permissions).toMatchObject({
      money: 'view',
      economy: 'view',
      budget_limits: 'manage',
      users: 'view',
    });
    const base = '/api/v1/admin';
    const can = (p: string, m: string) =>
      canAccess(a.role, a.permissions, p, m, false, null, a.noPii);
    expect(can(`${base}/billing/payments`, 'GET')).toBe(true);
    expect(can(`${base}/billing/refunds`, 'POST')).toBe(false);
    expect(can(`${base}/config/budgets/sms/day`, 'PUT')).toBe(true);
    expect(can(`${base}/config/feature-flags`, 'GET')).toBe(false);
    expect(can(`${base}/export/users`, 'GET')).toBe(false);
    expect(can(`${base}/integrations`, 'GET')).toBe(false);
  });

  it('moderator: moderation and verification, nothing about money', () => {
    const m = byKey('moderator');
    expect(m.permissions).toMatchObject({
      moderation: 'manage',
      verification: 'manage',
    });
    expect(m.permissions.money).toBeUndefined();
  });

  it('support: support and chats, users read only', () => {
    const s = byKey('support');
    expect(s.permissions).toMatchObject({
      support: 'manage',
      chats: 'manage',
      users: 'view',
    });
  });

  it('viewer: every grantable area, view only', () => {
    const v = byKey('viewer');
    const levels = new Set(Object.values(v.permissions));
    expect([...levels]).toEqual(['view']);
    for (const a of ADMIN_AREAS) {
      if (a === 'partner_report') continue;
      expect(v.permissions[a]).toBe('view');
    }
    expect(
      canAccess(v.role, v.permissions, '/api/v1/admin/users/x/warn', 'POST'),
    ).toBe(false);
  });
});
