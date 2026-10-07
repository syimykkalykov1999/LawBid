import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Owner 2026-10-05: shared plumbing of the state registry adapters. */

export const REGISTRY_TIMEOUT_MS = 8000;
/** Larger answers are refused: a lookup is one record. */
const MAX_BODY_BYTES = 512 * 1024;
/** `details.raw` keeps this much of the registry's record. */
const RAW_SNIPPET_CHARS = 1000;

/** Upper-case letters only: "O'Brien-Smith" and "OBRIEN SMITH" match. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/**
 * The account's name against the registry's: first + last when the
 * registry has them apart, otherwise both inside the full name.
 */
export function namesMatch(
  account: { firstName: string; lastName: string },
  registry: { first?: unknown; last?: unknown; full?: unknown },
): boolean {
  const first = normalizeName(account.firstName);
  const last = normalizeName(account.lastName);
  if (!last) return false;
  if (typeof registry.last === 'string') {
    if (normalizeName(registry.last) !== last) return false;
    return typeof registry.first === 'string'
      ? normalizeName(registry.first) === first
      : true;
  }
  if (typeof registry.full === 'string') {
    const full = normalizeName(registry.full);
    return full.includes(last) && (!first || full.includes(first));
  }
  return false;
}

/** "results.0.status" → value; '' → the object itself. */
export function getPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const part of path.split('.').filter(Boolean)) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(part);
      cur = Number.isInteger(i) ? cur[i] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** A short JSON copy of the registry's record for the admin. */
export function rawSnippet(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s.length > RAW_SNIPPET_CHARS
      ? `${s.slice(0, RAW_SNIPPET_CHARS)}…`
      : s;
  } catch {
    return '';
  }
}

/** "Active, Active - Good Standing" → ['active', 'active - good standing']. */
export function splitValues(raw: unknown): string[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  return list
    .filter(
      (v): v is string | number =>
        typeof v === 'string' || typeof v === 'number',
    )
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => v.length > 0);
}

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
  return (
    ip === '::' ||
    ip === '::1' ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    /^fe[89ab]/.test(ip) ||
    ip.startsWith('ff') ||
    ip.startsWith('64:ff9b:')
  );
}

/**
 * A registry URL the owner typed in the admin: https to a public host.
 * Plain http and local addresses only outside production (tests run a
 * fake registry on 127.0.0.1). Throws a readable message.
 */
export function assertRegistryUrl(raw: string, allowLocal: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Not a valid URL');
  }
  if (url.username || url.password) {
    throw new Error('Put the key in the key field, not in the URL');
  }
  if (allowLocal) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Only http(s) URLs');
    }
    return url;
  }
  if (url.protocol !== 'https:') throw new Error('Only https:// URLs');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const local =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateAddress(host);
  if (local) throw new Error('Local and private addresses are not allowed');
  return url;
}

/**
 * A public host name can still point at a private address (a DNS record
 * set to 169.254.169.254): every address the name resolves to must be
 * public. Security audit 2026-10-07 (SSRF). Skipped where local hosts are
 * allowed (tests, dev).
 */
export async function assertPublicResolution(
  url: URL,
  allowLocal: boolean,
  resolve: (host: string) => Promise<{ address: string }[]> = (host) =>
    lookup(host, { all: true, verbatim: true }),
): Promise<void> {
  if (allowLocal) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return; // literal addresses: assertRegistryUrl checked it
  let addresses: { address: string }[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new Error(`The registry host ${host} was not found`);
  }
  if (
    addresses.length === 0 ||
    addresses.some((a) => isPrivateAddress(a.address))
  ) {
    throw new Error('Local and private addresses are not allowed');
  }
}

export class RegistryHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** GET with a timeout, no redirects and a body size cap. 404 → null. */
export async function fetchJson(
  url: URL,
  headers: Record<string, string>,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REGISTRY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: ctrl.signal,
      redirect: 'error',
    });
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      throw new RegistryHttpError(
        res.status,
        `The registry refused the key (HTTP ${res.status})`,
      );
    }
    if (!res.ok) {
      throw new RegistryHttpError(
        res.status,
        `The registry answered HTTP ${res.status}`,
      );
    }
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new Error('The registry answer is too large');
    }
    return text.trim() === '' ? null : (JSON.parse(text) as unknown);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        `The registry did not answer in ${REGISTRY_TIMEOUT_MS / 1000} s`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface RegistryRecord {
  status: unknown;
  first: unknown;
  last: unknown;
  full: unknown;
  admitted: unknown;
  /** Owner 2026-10-05 (trust levels): the firm / employer on record. */
  firm?: unknown;
  raw: unknown;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v).trim() || null
    : null;

/**
 * The common rule of every adapter (owner 2026-10-04/05): `pass` needs the
 * number found, an active status and the account's name; a name that
 * differs is `manual_review` (nicknames, married names); a number not
 * found or a status that is not active is `fail`. Nothing here rejects
 * anybody — the caller only approves on `pass` or flags for an admin.
 */
export function outcomeFor(
  provider: string,
  input: { firstName: string; lastName: string },
  record: RegistryRecord | null,
  activeValues: string[],
  sourceUrl: string | null,
): {
  result: 'pass' | 'fail' | 'manual_review';
  details: Record<string, unknown>;
} {
  const details: Record<string, unknown> = {
    provider,
    found: record !== null,
    licenseStatus: null,
    name: null,
    admittedAt: null,
    sourceUrl,
  };
  if (!record) {
    return { result: 'fail', details: { ...details, reason: 'not_found' } };
  }
  const status = str(record.status);
  const active =
    activeValues.length === 0 ||
    (status !== null && activeValues.includes(status.toLowerCase()));
  details.licenseStatus = active ? 'active' : 'inactive';
  details.registryStatus = status;
  details.name =
    str(record.full) ??
    ([str(record.first), str(record.last)].filter(Boolean).join(' ') || null);
  details.admittedAt = str(record.admitted);
  details.firm = str(record.firm);
  details.raw = rawSnippet(record.raw);
  if (!active) {
    return { result: 'fail', details: { ...details, reason: 'not_active' } };
  }
  return namesMatch(input, record)
    ? { result: 'pass', details }
    : {
        result: 'manual_review',
        details: { ...details, reason: 'name_mismatch' },
      };
}
