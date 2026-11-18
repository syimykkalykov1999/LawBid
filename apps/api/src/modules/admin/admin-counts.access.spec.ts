import { canAccess } from '../admin-auth/admin-permissions';
import { AdminCountsController } from './admin-counts.controller';

/**
 * Verify batch 11 (B3): the sidebar badges (GET /admin/counts) are meant
 * for every admin role, but `counts` had no area, so every employee got
 * 404 (and an `admin.access_denied` audit row a minute). Each badge is
 * shown only where the admin may open the section.
 */
describe('GET /admin/counts for employees (B3)', () => {
  it('every admin reaches the route', () => {
    expect(canAccess('support', {}, '/api/v1/admin/counts', 'GET')).toBe(true);
    expect(
      canAccess(
        'moderator',
        { moderation: 'view' },
        '/api/v1/admin/counts',
        'GET',
      ),
    ).toBe(true);
  });

  function build() {
    const counts = {
      get: jest.fn().mockResolvedValue({
        verificationQueue: 3,
        openReports: 2,
        supportUnread: 1,
        trustQueue: 4,
      }),
      etagOf: jest.fn(() => 'W/"x"'),
    };
    const ctl = new AdminCountsController(counts as never);
    const req = { header: () => undefined, headers: {} } as never;
    const res = { setHeader: jest.fn(), status: jest.fn() } as never;
    return { ctl, req, res };
  }

  it('a badge of a section the employee cannot open is 0', async () => {
    const { ctl, req, res } = build();
    const admin = {
      id: 'a',
      ip: null,
      adminRole: 'support',
      permissions: { support: 'manage' },
      countries: null,
    } as never;
    expect(await ctl.getCounts(admin, req, res)).toEqual({
      verificationQueue: 0,
      openReports: 0,
      supportUnread: 1,
      trustQueue: 0,
    });
  });

  it('the owner sees every badge', async () => {
    const { ctl, req, res } = build();
    const owner = {
      id: 'o',
      ip: null,
      adminRole: 'super_admin',
      permissions: {},
      countries: null,
    } as never;
    expect(await ctl.getCounts(owner, req, res)).toEqual({
      verificationQueue: 3,
      openReports: 2,
      supportUnread: 1,
      trustQueue: 4,
    });
  });
});
