import {
  isExportRequest,
  openedCard,
  sameNetwork,
  utcDay,
} from './staff-security.util';

describe('isExportRequest (staff package T11)', () => {
  it.each([
    '/api/v1/admin/export/users',
    '/api/v1/admin/outreach/leads/export.csv?x=1',
    '/api/v1/admin/attorney-ads/archive/export',
    '/api/v1/admin/partners/commissions/export.csv',
    '/api/v1/admin/anything/report.csv',
  ])('%s is an export', (p) => expect(isExportRequest(p)).toBe(true));

  it.each([
    '/api/v1/admin/users/3f2b8a52-1c3e-4a6f-9d2e-0a1b2c3d4e5f',
    '/api/v1/admin/verification/requests',
    '/api/v1/admin/exporters',
    '/api/v1/admin/verification/documents/x/download',
  ])('%s is not', (p) => expect(isExportRequest(p)).toBe(false));
});

describe('openedCard', () => {
  const id = '3F2B8A52-1c3e-4a6f-9d2e-0a1b2c3d4e5f';
  it('a GET of one item in a card section is an opened card', () => {
    expect(
      openedCard('GET', `/api/v1/admin/verification/requests/${id}`),
    ).toEqual({
      area: 'verification',
      id: id.toLowerCase(),
    });
    expect(openedCard('GET', `/api/v1/admin/users/${id}?x=1`)?.area).toBe(
      'users',
    );
  });
  it('lists, writes, background polls and other sections are not', () => {
    expect(openedCard('GET', '/api/v1/admin/users')).toBeNull();
    expect(openedCard('POST', `/api/v1/admin/users/${id}`)).toBeNull();
    expect(openedCard('GET', `/api/v1/admin/users/${id}`, true)).toBeNull();
    expect(openedCard('GET', `/api/v1/admin/billing/${id}`)).toBeNull();
  });
});

describe('sameNetwork', () => {
  it('same IPv4 /24 is the same place', () => {
    expect(sameNetwork('203.0.113.5', '203.0.113.200')).toBe(true);
    expect(sameNetwork('::ffff:203.0.113.5', '203.0.113.9')).toBe(true);
  });
  it('another /24 or another family is a change', () => {
    expect(sameNetwork('203.0.113.5', '203.0.114.5')).toBe(false);
    expect(sameNetwork('203.0.113.5', '2001:db8::1')).toBe(false);
  });
  it('IPv6 compares the /64', () => {
    expect(sameNetwork('2001:db8:1:2::1', '2001:db8:1:2:aaaa::9')).toBe(true);
    expect(sameNetwork('2001:db8:1:2::1', '2001:db8:1:3::1')).toBe(false);
  });
  it('an unknown address is never a change', () => {
    expect(sameNetwork('', '1.2.3.4')).toBe(true);
    expect(sameNetwork(null, undefined)).toBe(true);
  });
  it('utcDay formats UTC', () => {
    expect(utcDay(new Date('2026-10-27T23:59:59Z'))).toBe('2026-10-27');
  });
});
