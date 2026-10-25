import { ipAllowed, normalizeIp, parseAllowlistEntry } from './admin-ip-allowlist';

describe('admin IP allowlist (owner 2026-10-28)', () => {
  it('matches an exact IPv4 and IPv6 address', () => {
    expect(ipAllowed('203.0.113.7', ['203.0.113.7'])).toBe(true);
    expect(ipAllowed('203.0.113.8', ['203.0.113.7'])).toBe(false);
    expect(ipAllowed('2001:db8::1', ['2001:DB8::1'])).toBe(true);
  });

  it('matches an IPv4 CIDR range', () => {
    expect(ipAllowed('203.0.113.200', ['203.0.113.0/24'])).toBe(true);
    expect(ipAllowed('203.0.114.1', ['203.0.113.0/24'])).toBe(false);
    expect(ipAllowed('10.1.2.3', ['0.0.0.0/0'])).toBe(true);
    expect(ipAllowed('10.1.2.3', ['10.1.2.3/32'])).toBe(true);
  });

  it('sees through the IPv4-mapped IPv6 form', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipAllowed('::ffff:203.0.113.7', ['203.0.113.0/24'])).toBe(true);
  });

  it('denies a missing address and an empty list', () => {
    expect(ipAllowed(undefined, ['203.0.113.7'])).toBe(false);
    expect(ipAllowed('203.0.113.7', [])).toBe(false);
  });

  it('ignores malformed lines instead of opening the door', () => {
    expect(parseAllowlistEntry('not-an-ip')).toBeNull();
    expect(parseAllowlistEntry('1.2.3.4/40')).toBeNull();
    expect(parseAllowlistEntry('2001:db8::/32')).toBeNull();
    expect(ipAllowed('1.2.3.4', ['garbage', '1.2.3.4/99'])).toBe(false);
  });
});
