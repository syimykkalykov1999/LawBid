import { isIPv4, isIPv6 } from 'node:net';
import { normalizeIp } from '../admin-auth/admin-ip-allowlist';
import { routeArea } from '../admin-auth/admin-permissions';

/**
 * Staff package T11 — pure helpers of the data-security layer (no I/O, so
 * the unit tests pin every rule).
 */

/** A CSV / bulk export route: `.../export`, `.../export/<what>`,
 * `.../export.csv` or any `.csv` file. («download» is NOT here: a verifier
 * downloads a licence document to check it.) */
const EXPORT_RE = /\/export(?:\.csv)?(?:[/?#]|$)|\.csv(?:[?#]|$)/i;

/** True when the admin request asks for a bulk export. */
export function isExportRequest(path: string): boolean {
  return routeArea(path) === 'exports' || EXPORT_RE.test(path);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Sections where a request for one item = "a person opened a card". */
const CARD_AREAS: ReadonlySet<string> = new Set([
  'users',
  'verification',
  'moderation',
  'support',
  'cases',
  'chats',
]);

/** `work_leases.kind` values a card of each area can be leased under; an
 * area missing here has no queue, so "outside my queue" does not apply. */
export const LEASE_KINDS_BY_AREA: Readonly<Record<string, readonly string[]>> =
  {
    verification: ['verification'],
    support: ['support_ticket'],
    moderation: ['report', 'media_report', 'mod_appeal', 'review_appeal'],
  };

export interface OpenedCard {
  area: string;
  id: string;
}

/** A GET of one item (`/admin/<area>/.../<uuid>`) in a card section; null
 * for everything else (lists, writes, background polls). */
export function openedCard(
  method: string,
  path: string,
  background = false,
): OpenedCard | null {
  if (method !== 'GET' || background) return null;
  const area = routeArea(path);
  if (!area || !CARD_AREAS.has(area)) return null;
  const m = UUID_RE.exec(path.split('?')[0]);
  return m ? { area, id: m[0].toLowerCase() } : null;
}

function expandV6(ip: string): string[] | null {
  const zone = ip.split('%')[0];
  const [head, tail] = zone.split('::');
  if (zone.includes('::') && zone.split('::').length > 2) return null;
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const missing = 8 - h.length - t.length;
  if (zone.includes('::') ? missing < 0 : h.length !== 8) return null;
  const all = zone.includes('::')
    ? [...h, ...Array<string>(missing).fill('0'), ...t]
    : h;
  return all.map((g) => g.padStart(4, '0'));
}

/**
 * Same network = same IPv4 /24 or same IPv6 /64, so a phone hopping between
 * towers of one operator or a DHCP renewal does not count as a new place.
 * An unknown address on either side counts as the same (nothing to compare).
 */
export function sameNetwork(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return true;
  const x = normalizeIp(a);
  const y = normalizeIp(b);
  if (x === y) return true;
  if (isIPv4(x) && isIPv4(y)) {
    return (
      x.split('.').slice(0, 3).join('.') === y.split('.').slice(0, 3).join('.')
    );
  }
  if (isIPv6(x) && isIPv6(y)) {
    const gx = expandV6(x);
    const gy = expandV6(y);
    return (
      !!gx && !!gy && gx.slice(0, 4).join(':') === gy.slice(0, 4).join(':')
    );
  }
  return false;
}

/** `2026-10-27` (UTC). */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}
