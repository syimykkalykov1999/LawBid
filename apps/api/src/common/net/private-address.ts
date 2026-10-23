import { isIP } from 'node:net';

function privateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Loopback, private, link-local (169.254.x.x: the cloud metadata
 * service), CGNAT and multicast addresses, IPv4 and IPv6 — including an
 * IPv4 address wrapped in IPv6 (::ffff:169.254.169.254). Security audit
 * 2026-10-07 (SSRF).
 */
export function isPrivateAddress(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, '').toLowerCase();
  const v = isIP(ip);
  if (v === 4) return privateIPv4(ip);
  if (v !== 6) return false;
  const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return privateIPv4(mapped[1]);
  const hexMapped = /^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return privateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  // 6to4 (2002:AABB:CCDD::) carries an IPv4 address: judge that one.
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/.exec(ip);
  if (sixToFour) {
    const hi = parseInt(sixToFour[1], 16);
    const lo = parseInt(sixToFour[2], 16);
    if (privateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)) {
      return true;
    }
  }
  return (
    ip === '::' ||
    // Deprecated IPv4-compatible form (::7f00:1) and the discard prefix.
    /^::[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(ip) ||
    ip.startsWith('100::') ||
    // Teredo and documentation ranges never carry a real site.
    ip.startsWith('2001:0:') ||
    ip.startsWith('2001:db8:') ||
    ip === '::1' ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    /^fe[89ab]/.test(ip) ||
    ip.startsWith('ff') ||
    ip.startsWith('64:ff9b:')
  );
}
