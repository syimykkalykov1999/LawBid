import type { LegalDocType } from '../../generated/prisma/client';
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

/**
 * D1-50 (13.11): admin settings a legal text may name, written in the text as
 * `{{key}}` and filled in on every public read with the live value, so a
 * retention period the owner changes in the admin is never stale in the
 * policy (strict rule 11: user-facing numbers come from the settings).
 */
export const LEGAL_LIVE_SETTINGS = [
  'verification.face_match.retention_days',
  'verification.media.abandoned_days',
] as const;
export type LegalLiveSetting = (typeof LEGAL_LIVE_SETTINGS)[number];

/** [md] with every `{{key}}` of [LEGAL_LIVE_SETTINGS] replaced by its value;
 * unknown or missing keys stay as written. */
export function fillLiveSettings(
  md: string,
  values: Partial<Record<LegalLiveSetting, number | string>>,
): string {
  return md.replace(/\{\{([a-z0-9_.]+)\}\}/g, (all, key: string) => {
    const v = values[key as LegalLiveSetting];
    return v === undefined || v === null ? all : String(v);
  });
}

/** The live values the text of [md] names (only the keys it uses). */
export function liveSettingKeys(md: string): LegalLiveSetting[] {
  return LEGAL_LIVE_SETTINGS.filter((k) => md.includes(`{{${k}}}`));
}

/** D1-50: the heading of the biometric section (en / ru, numbered or not). */
export const BIOMETRIC_HEADING =
  /^##\s+(\d+\.\s+)?(Biometric information|Биометрические данные)/i;

/**
 * D1-50: the "Biometric information" section of a privacy text (heading up
 * to the next `## ` heading), or null. Numbered headings ("## 6. …") and the
 * Russian heading are recognised; the returned heading has no number, so it
 * fits any older text it is appended to.
 */
export function biometricSection(md: string): string | null {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => BIOMETRIC_HEADING.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const heading = lines[start].replace(/^##\s+(\d+\.\s+)?/, '## ');
  return [heading, ...lines.slice(start + 1, end)].join('\n').trimEnd();
}
