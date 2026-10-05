import { namesMatch } from '../verification/providers/bar-lookup/registry-http';
import {
  MAX_TRUST_LEVEL,
  NAME_CHECK,
  type NameCheck,
  type TrustLevel,
} from './attorney-trust.constants';

/** What is known about an attorney, independent of storage. */
export interface TrustSignals {
  /** verification_status === 'verified' with ≥1 verified license. */
  selfAttested: boolean;
  /** State registry (or a verifier) confirmed the bar number. */
  licenseConfirmed: boolean;
  licenseConfirmedBy: 'registry' | 'staff' | null;
  /** A verifier checked bar card + ID + selfie. */
  documentsVerified: boolean;
  /** Stripe Connect KYC finished (charges enabled, details submitted). */
  stripeKyc: boolean;
  /** Stripe's legal name (or a representative / owner of the company
   * account) vs the profile / registry name. */
  nameCheck: NameCheck;
  /** Company account: the attorney's link to that firm is shown. */
  firmLinkConfirmed: boolean;
}

export interface LicenseLike {
  license_status: string;
  registry_flag: string | null;
  auto_check_result: unknown;
}

/**
 * The registry confirmed at least one verified license (its last lookup
 * passed) and no license carries a flag. A flag anywhere (not found, not
 * active, name mismatch, duplicate claim) is conservative: nothing is
 * "confirmed" until a verifier clears it.
 */
export function registryConfirms(licenses: readonly LicenseLike[]): boolean {
  if (licenses.some((l) => l.registry_flag)) return false;
  return licenses.some(
    (l) =>
      l.license_status === 'verified' &&
      isObject(l.auto_check_result) &&
      l.auto_check_result.result === 'pass',
  );
}

/** Stripe counts as identity when the verified person is the attorney
 * (name match), or when the account belongs to a firm the attorney is
 * shown to work for. */
export function stripeIdentity(s: TrustSignals): boolean {
  return (
    s.stripeKyc && (s.nameCheck === NAME_CHECK.match || s.firmLinkConfirmed)
  );
}

/** Registry firm vs Stripe company name: one contains the other after
 * normalization ("Smith & Jones LLP" ~ "SMITH JONES LLP"). */
export function firmNamesMatch(a: string | null, b: string | null): boolean {
  const x = normalizeFirm(a);
  const y = normalizeFirm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

const FIRM_NOISE =
  /\b(LLP|LLC|PLLC|PC|PA|LTD|INC|LAW|OFFICES?|FIRM|GROUP|THE|OF|AND|ASSOCIATES|ATTORNEYS?|AT|ESQ)\b/g;

export function normalizeFirm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(FIRM_NOISE, ' ')
    .replace(/[^A-Z0-9]/g, '');
}

/** "https://www.smithlaw.com/team" → "smithlaw.com"; null when not a URL. */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.includes('://') ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

/** The e-mail domain is the site's domain or a subdomain of it. */
export function domainsMatch(
  emailDomain: string | null,
  siteDomain: string | null,
): boolean {
  if (!emailDomain || !siteDomain) return false;
  const e = emailDomain.toLowerCase();
  const s = siteDomain.toLowerCase();
  return e === s || e.endsWith(`.${s}`) || s.endsWith(`.${e}`);
}

export function identityConfirmed(s: TrustSignals): boolean {
  return s.documentsVerified || stripeIdentity(s);
}

/** The level the signals support (see attorney-trust.constants). */
export function computeLevel(s: TrustSignals): TrustLevel {
  if (!s.selfAttested) return 0;
  if (!s.licenseConfirmed) return 0;
  if (!identityConfirmed(s)) return 1;
  if (s.documentsVerified && stripeIdentity(s)) return MAX_TRUST_LEVEL;
  return 2;
}

/**
 * Stripe's verified legal name against the profile name and, when the
 * registry returned one, the registry's name. Both known names must
 * agree with Stripe; an empty Stripe name is `unknown`.
 */
export function checkLegalName(
  stripe: {
    firstName?: string | null;
    lastName?: string | null;
    full?: string | null;
  },
  profile: { firstName: string | null; lastName: string | null },
  registryName: string | null,
): NameCheck {
  const full = (stripe.full ?? '').trim();
  const first = (stripe.firstName ?? '').trim();
  const last = (stripe.lastName ?? '').trim();
  if (!full && !last) return NAME_CHECK.unknown;
  const account = {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
  };
  if (!account.lastName) return NAME_CHECK.unknown;
  const stripeRecord = last ? { first, last } : { full };
  if (!namesMatch(account, stripeRecord)) return NAME_CHECK.mismatch;
  if (registryName) {
    // The registry's full name must contain Stripe's last name (and first
    // name when Stripe has them apart).
    const ok = namesMatch(
      { firstName: first, lastName: last || lastWord(full) },
      { full: registryName },
    );
    if (!ok) return NAME_CHECK.mismatch;
  }
  return NAME_CHECK.match;
}

/** Registry firm recorded by the last lookup of a verified license. */
export function registryFirmOf(
  licenses: readonly LicenseLike[],
): string | null {
  for (const l of licenses) {
    if (l.license_status !== 'verified' || !isObject(l.auto_check_result)) {
      continue;
    }
    const firm = l.auto_check_result.firm;
    if (typeof firm === 'string' && firm.trim()) return firm.trim();
  }
  return null;
}

/** Registry name recorded by the last lookup of a verified license. */
export function registryNameOf(
  licenses: readonly LicenseLike[],
): string | null {
  for (const l of licenses) {
    if (l.license_status !== 'verified' || !isObject(l.auto_check_result)) {
      continue;
    }
    const name = l.auto_check_result.name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return null;
}

/** Payout delay LawBid asks Stripe for at [level]; null = Stripe default. */
/** Owner 2026-10-05: the admin's "what to require" switches. */
export interface TrustRequirements {
  registry: boolean;
  identity: boolean;
  documents: boolean;
}

export type Requirement = keyof TrustRequirements;

/** Which enabled requirements the facts do not satisfy yet. */
export function missingRequirements(
  s: TrustSignals,
  r: TrustRequirements,
): Requirement[] {
  const out: Requirement[] = [];
  if (r.registry && !s.licenseConfirmed) out.push('registry');
  if (r.identity && !stripeIdentity(s)) out.push('identity');
  if (r.documents && !s.documentsVerified) out.push('documents');
  return out;
}

/**
 * Cleared = the badge and in-app payments may open: a self-attested
 * attorney whom staff confirmed, or whose facts satisfy every enabled
 * requirement. Staff clearance is final (no automatic re-check undoes it).
 */
export function isCleared(
  s: TrustSignals,
  r: TrustRequirements,
  staffCleared: boolean,
): boolean {
  if (!s.selfAttested) return false;
  return staffCleared || missingRequirements(s, r).length === 0;
}

/** Stripe payout delay while the attorney is not cleared; 0 = default. */
export function payoutDelayFor(cleared: boolean, days: number): number | null {
  if (days <= 0 || cleared) return null;
  return days;
}

function lastWord(s: string): string {
  const parts = s.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
