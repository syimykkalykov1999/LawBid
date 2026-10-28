import { createHash } from 'node:crypto';
import type { FeeType, PartyRole } from '@prisma/client';
import type { PaymentTerms } from '../bids/bids.public';

/**
 * Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md
 * §3): everything the PDF prints, frozen when the party taps Accept. The
 * record's SHA-256 is the hash of this object in canonical form (keys
 * sorted, no whitespace), so the same data always gives the same code.
 * No phone numbers (owner decision).
 */
export const DEAL_RECORD_SNAPSHOT_VERSION = 1;

export interface SnapshotParty {
  id: string;
  fullName: string;
  email: string | null;
  username: string | null;
}

export interface SnapshotAttorney extends SnapshotParty {
  barState: string | null;
  barNumber: string | null;
  firmName: string | null;
}

export interface SnapshotTerms {
  feeType: FeeType;
  amountCents: number;
  percentBps: number | null;
  paymentTerms: PaymentTerms | null;
}

export interface SnapshotOffer extends SnapshotTerms {
  roundNo: number;
  fromRole: PartyRole;
  /** ISO 8601, UTC. */
  createdAt: string;
  /** Verbatim: no translation, no trimming. */
  message: string | null;
  status: string;
}

export interface SnapshotTexts {
  /** The fixed line under the title (English). */
  notContract: string;
  /** The footer of every page (English). */
  footer: string;
  /** Version of the admin texts these came from (0 = built-in). */
  textVersion: number;
}

export interface DealRecordSnapshot {
  version: number;
  recordId: string;
  case: {
    id: string;
    title: string;
    practice: string | null;
    states: string[];
  };
  client: SnapshotParty;
  attorney: SnapshotAttorney;
  acceptedBy: PartyRole;
  /** ISO 8601, UTC — when the party tapped Accept. */
  acceptedAt: string;
  terms: SnapshotTerms;
  history: SnapshotOffer[];
  texts: SnapshotTexts;
}

/** JSON with every object's keys sorted, recursively; arrays keep order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export const snapshotSha256 = (snapshot: DealRecordSnapshot): string =>
  createHash('sha256').update(canonicalJson(snapshot)).digest('hex');

/** `<first 8 of the id>-<first 8 of the SHA-256>`: printed on every page. */
export const recordCodeOf = (recordId: string, sha256Hex: string): string =>
  `${recordId.replace(/-/g, '').slice(0, 8)}-${sha256Hex.slice(0, 8)}`;

/** "First Last" or the username, never an empty string. */
export function fullNameOf(u: {
  first_name: string | null;
  last_name: string | null;
  username?: string | null;
}): string {
  const name = [u.first_name, u.last_name]
    .map((x) => x?.trim() ?? '')
    .filter((x) => x !== '')
    .join(' ');
  return name || (u.username ? `@${u.username}` : '—');
}
