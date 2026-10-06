import {
  canAccess,
  parsePermissions,
  PARTNER_TEAM_MAX,
  readPartner,
  storePermissions,
} from './admin-permissions';

const PARTNER = '11111111-2222-3333-4444-555555555555';

describe('country partner team permissions (owner 2026-10-06)', () => {
  const lead = { partnerId: PARTNER, lead: true };
  const staff = { partnerId: PARTNER, lead: false };

  it('stores the membership, the country and never the deputy right', () => {
    const stored = storePermissions(
      { verification: 'manage', settings: 'manage', legal: 'manage' },
      true,
      ['CA'],
      lead,
    );
    expect(stored).toEqual({
      verification: 'manage',
      countries: ['CA'],
      country_partner: PARTNER,
      partner_lead: true,
    });
    expect(readPartner(stored)).toEqual(lead);
    expect(readPartner({ users: 'view' })).toBeNull();
  });

  it('caps whatever was stored at the partner limits', () => {
    const perms = parsePermissions({
      users: 'manage',
      settings: 'manage',
      legal: 'manage',
      localization: 'manage',
      broadcasts: 'manage',
      payroll: 'manage',
      verification: 'manage',
    });
    // users only read: no deleting people, no sanctions.
    expect(
      canAccess('support', perms, '/api/v1/admin/users/1', 'GET', false, staff),
    ).toBe(true);
    expect(
      canAccess(
        'support',
        perms,
        '/api/v1/admin/users/1/ban',
        'POST',
        false,
        staff,
      ),
    ).toBe(false);
    for (const p of [
      '/api/v1/admin/feature-flags',
      '/api/v1/admin/legal-documents',
      '/api/v1/admin/i18n/import',
      '/api/v1/admin/countries/CA',
      '/api/v1/admin/broadcasts',
      '/api/v1/admin/payroll',
      '/api/v1/admin/billing/payments',
      '/api/v1/admin/subscriptions',
      '/api/v1/admin/integrations',
      '/api/v1/admin/country-partners',
      '/api/v1/admin/audit-log',
      '/api/v1/admin/sessions',
    ]) {
      expect(canAccess('support', perms, p, 'GET', false, lead)).toBe(false);
      expect(canAccess('support', perms, p, 'POST', false, lead)).toBe(false);
    }
    expect(
      canAccess(
        'support',
        perms,
        '/api/v1/admin/verification/queue',
        'POST',
        false,
        staff,
      ),
    ).toBe(true);
  });

  it('only the lead manages admins (their own team, narrowed by the service)', () => {
    expect(
      canAccess(
        'support',
        PARTNER_TEAM_MAX,
        '/api/v1/admin/admins',
        'POST',
        false,
        lead,
      ),
    ).toBe(true);
    expect(
      canAccess(
        'support',
        PARTNER_TEAM_MAX,
        '/api/v1/admin/admins',
        'POST',
        false,
        staff,
      ),
    ).toBe(false);
  });

  it('the partner page is open to the team and closed to LawBid staff', () => {
    expect(
      canAccess(
        'support',
        {},
        '/api/v1/admin/country-partner',
        'GET',
        false,
        staff,
      ),
    ).toBe(true);
    expect(
      canAccess(
        'support',
        { users: 'manage' },
        '/api/v1/admin/country-partner',
        'GET',
      ),
    ).toBe(false);
    // The owner's deputy reads money pages, but not a partner's own page.
    expect(
      canAccess('support', {}, '/api/v1/admin/country-partner', 'GET', true),
    ).toBe(false);
  });
});
