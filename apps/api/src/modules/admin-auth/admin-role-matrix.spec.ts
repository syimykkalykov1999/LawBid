import { canAccess, type AdminPermissions } from './admin-permissions';

/** One probe route per panel section: [area, read path, write path]. */
const PROBES: [string, string, string][] = [
  ['dashboard', '/api/v1/admin/dashboard', ''],
  ['users', '/api/v1/admin/users', '/api/v1/admin/users/x/warn'],
  [
    'verification',
    '/api/v1/admin/verification/requests',
    '/api/v1/admin/verification/requests/x/approve',
  ],
  [
    'verification',
    '/api/v1/admin/client-badges',
    '/api/v1/admin/client-badges/bulk-approve',
  ],
  [
    'moderation',
    '/api/v1/admin/moderation/reports',
    '/api/v1/admin/moderation/reports/x/resolve',
  ],
  [
    'content',
    '/api/v1/admin/content/posts',
    '/api/v1/admin/content/posts/x/remove',
  ],
  [
    'media',
    '/api/v1/admin/media/videos',
    '/api/v1/admin/media/videos/x/remove',
  ],
  ['cases', '/api/v1/admin/cases', '/api/v1/admin/case-disputes/x/resolve'],
  [
    'support',
    '/api/v1/admin/support/tickets',
    '/api/v1/admin/support/tickets/x/reply',
  ],
  ['teams', '/api/v1/admin/teams', '/api/v1/admin/teams/x/suspend'],
  ['broadcasts', '/api/v1/admin/broadcasts', '/api/v1/admin/broadcasts'],
  [
    'email_templates',
    '/api/v1/admin/email-templates',
    '/api/v1/admin/email-templates/x',
  ],
  ['localization', '/api/v1/admin/i18n/languages', '/api/v1/admin/i18n/import'],
  ['settings', '/api/v1/admin/config', '/api/v1/admin/feature-flags/x'],
  ['legal', '/api/v1/admin/legal-documents', '/api/v1/admin/legal-documents'],
  [
    'data_requests',
    '/api/v1/admin/data-requests',
    '/api/v1/admin/data-requests/x/respond',
  ],
  ['exports', '/api/v1/admin/export/users', ''],
  [
    'sanctions',
    '/api/v1/admin/sanctions/bans',
    '/api/v1/admin/sanctions/users/x/block',
  ],
];
const SUPER_ONLY = [
  '/api/v1/admin/billing/payments',
  '/api/v1/admin/subscriptions',
  '/api/v1/admin/promotions',
  '/api/v1/admin/referrals/settings',
  '/api/v1/admin/integrations',
  '/api/v1/admin/audit-log',
  '/api/v1/admin/sessions',
];

const PROFILES: { name: string; perms: AdminPermissions; manager?: boolean }[] =
  [
    { name: 'only verification (manage)', perms: { verification: 'manage' } },
    { name: 'only support (manage)', perms: { support: 'manage' } },
    { name: 'only moderation (manage)', perms: { moderation: 'manage' } },
    {
      name: 'view-only everywhere',
      perms: Object.fromEntries(PROBES.map(([a]) => [a, 'view'])),
    },
    { name: 'nothing granted', perms: {} },
    { name: 'admin manager, no areas', perms: {}, manager: true },
    {
      name: 'admin manager + cases',
      perms: { cases: 'manage' },
      manager: true,
    },
  ];

describe('admin rights matrix (every profile x every section)', () => {
  it.each(PROFILES)('$name', ({ perms, manager }) => {
    for (const [area, read, write] of PROBES) {
      const have = (perms as Record<string, string>)[area];
      expect(canAccess('moderator', perms, read, 'GET', !!manager)).toBe(
        !!have,
      );
      if (write) {
        expect(canAccess('moderator', perms, write, 'POST', !!manager)).toBe(
          have === 'manage',
        );
      }
    }
    for (const p of SUPER_ONLY) {
      expect(canAccess('moderator', perms, p, 'GET', !!manager)).toBe(false);
    }
    expect(
      canAccess('moderator', perms, '/api/v1/admin/admins', 'GET', !!manager),
    ).toBe(!!manager);
    expect(
      canAccess(
        'moderator',
        perms,
        '/api/v1/admin/new-unknown',
        'GET',
        !!manager,
      ),
    ).toBe(false);
  });

  it('super admin reaches everything', () => {
    for (const [, read, write] of PROBES) {
      expect(canAccess('super_admin', {}, read, 'GET')).toBe(true);
      if (write) expect(canAccess('super_admin', {}, write, 'POST')).toBe(true);
    }
    for (const p of SUPER_ONLY)
      expect(canAccess('super_admin', {}, p, 'GET')).toBe(true);
  });
});
