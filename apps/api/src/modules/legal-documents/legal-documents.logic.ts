import type { LegalDocType } from '@prisma/client';
import { LEGACY_ACCEPTED_TYPES } from './legal-documents.constants';

/** A published version (current or archived) as the logic sees it. */
export interface PublishedDoc {
  id: string;
  doc_type: LegalDocType;
  locale: string;
  version: string;
  published_at: Date | null;
  is_current: boolean;
  requires_reacceptance: boolean;
}

/** The user's latest consent row for a type. */
export interface LatestConsent {
  consent_type: string;
  granted: boolean;
  document: { id: string; published_at: Date | null } | null;
}

export type PendingReason = 'new' | 'updated';

export interface PendingItem {
  doc: PublishedDoc;
  reason: PendingReason;
}

/**
 * Version number of a new publication: the publication date plus a counter
 * for the same day (2026-10-05.1, 2026-10-05.2, ...).
 */
export function nextVersion(date: Date, existing: readonly string[]): string {
  const day = date.toISOString().slice(0, 10);
  const prefix = `${day}.`;
  let max = 0;
  for (const v of existing) {
    if (!v.startsWith(prefix)) continue;
    const n = Number(v.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/** The current version for the user's language, falling back to English,
 * then to any language. */
export function pickCurrent(
  docs: readonly PublishedDoc[],
  type: LegalDocType,
  locale: string,
): PublishedDoc | null {
  const cur = docs.filter((d) => d.doc_type === type && d.is_current);
  return (
    cur.find((d) => d.locale === locale) ??
    cur.find((d) => d.locale === 'en') ??
    cur[0] ??
    null
  );
}

/**
 * Which of [types] the user must accept (again).
 *
 * - no current version of a type: nothing to accept;
 * - the user has not accepted the type (or withdrew): `new`;
 * - the accepted version is the current one (in any language): fine;
 * - an older version was accepted: asked again only when a version
 *   published after it is flagged `requires_reacceptance` (a material
 *   change); small fixes do not bother people;
 * - a consent without a document (given before versions existed) counts
 *   for the old types only.
 */
export function computePending(input: {
  types: readonly LegalDocType[];
  locale: string;
  docs: readonly PublishedDoc[];
  consents: readonly LatestConsent[];
}): PendingItem[] {
  const out: PendingItem[] = [];
  for (const type of input.types) {
    const current = pickCurrent(input.docs, type, input.locale);
    if (!current) continue;
    const consent = input.consents.find((c) => c.consent_type === type);
    if (!consent || !consent.granted) {
      out.push({ doc: current, reason: 'new' });
      continue;
    }
    if (!consent.document) {
      if (!LEGACY_ACCEPTED_TYPES.has(type)) {
        out.push({ doc: current, reason: 'new' });
      }
      continue;
    }
    const accepted = consent.document;
    if (input.docs.some((d) => d.id === accepted.id && d.is_current)) continue;
    const since = accepted.published_at?.getTime() ?? 0;
    const material = input.docs.some(
      (d) =>
        d.doc_type === type &&
        d.locale === current.locale &&
        d.requires_reacceptance &&
        (d.published_at?.getTime() ?? 0) > since,
    );
    if (material) out.push({ doc: current, reason: 'updated' });
  }
  return out;
}
