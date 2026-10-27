import { isIPv4, isIPv6 } from 'node:net';

/** One allowlist line: an exact address, or an IPv4 range. */
export type AllowlistEntry =
  { kind: 'exact'; ip: string } | { kind: 'v4'; base: number; mask: number };

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
}

/** `::ffff:1.2.3.4` (how Node shows an IPv4 client on a dual-stack socket)
 * → `1.2.3.4`; anything else is returned lower-cased and trimmed. */
export function normalizeIp(raw: string): string {
  const ip = raw.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  return mapped ? mapped[1] : ip;
}

/**
 * Owner 2026-10-28: `1.2.3.4`, `2001:db8::1` or `1.2.3.0/24`. IPv6 ranges
 * are not supported (list the addresses); null = not a valid line.
 */
export function parseAllowlistEntry(raw: string): AllowlistEntry | null {
  const text = normalizeIp(raw);
  const slash = text.indexOf('/');
  if (slash === -1) {
    return isIPv4(text) || isIPv6(text) ? { kind: 'exact', ip: text } : null;
  }
  const ip = text.slice(0, slash);
  const bits = Number(text.slice(slash + 1));
  if (!isIPv4(ip) || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return null;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { kind: 'v4', base: (v4ToInt(ip) & mask) >>> 0, mask };
}

/** True when [ip] matches any valid entry of [list]. */
export function ipAllowed(
  ip: string | null | undefined,
  list: string[],
): boolean {
  if (!ip) return false;
  const addr = normalizeIp(ip);
  for (const line of list) {
    const entry = parseAllowlistEntry(line);
    if (!entry) continue;
    if (entry.kind === 'exact') {
      if (entry.ip === addr) return true;
    } else if (
      isIPv4(addr) &&
      (v4ToInt(addr) & entry.mask) >>> 0 === entry.base
    ) {
      return true;
    }
  }
  return false;
}
