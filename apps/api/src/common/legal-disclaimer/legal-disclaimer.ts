import { createHash } from 'node:crypto';

/**
 * Owner 2026-10-28 (legal safety): the "general information, not legal
 * advice; no attorney-client relationship" notice that the SERVER adds to
 * every Q&A, template and deadline response (`meta.disclaimer`), so no
 * client build can forget it. Pure helpers; the interceptor reads the
 * wording from the admin settings.
 *
 * Why: giving case-specific advice online can be the unauthorized practice
 * of law (ABA Model Rule 5.5; state UPL statutes) and answering without a
 * clear notice can imply an attorney-client relationship (Model Rule 1.18
 * duties to a prospective client; Avvo and Justia show the same notice
 * under every answer).
 */

export const DISCLAIMER_KINDS = ['qa', 'template', 'deadline'] as const;
export type DisclaimerKind = (typeof DISCLAIMER_KINDS)[number];

export interface LegalDisclaimer {
  /** What to show. */
  text: string;
  /** Changes when the wording changes (a client may re-show it). */
  version: string;
  /** The state whose own wording was used; null = the default text. */
  stateCode: string | null;
  kind: DisclaimerKind;
}

const STATE_RE = /^[A-Z]{2}$/;

/** `{"CA":"..."}` → map; anything malformed → empty (the default text). */
export function parseStateTexts(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const code = k.trim().toUpperCase();
        if (STATE_RE.test(code) && typeof v === 'string' && v.trim()) {
          out.set(code, v.trim());
        }
      }
    }
  } catch {
    /* malformed JSON in the admin: fall back to the default text */
  }
  return out;
}

export function buildDisclaimer(input: {
  kind: DisclaimerKind;
  defaultText: string;
  byState: string;
  extra: string;
  stateCode: string | null;
}): LegalDisclaimer {
  const state =
    input.stateCode &&
    STATE_RE.test(input.stateCode) &&
    input.stateCode !== 'US'
      ? input.stateCode
      : null;
  const own = state ? parseStateTexts(input.byState).get(state) : undefined;
  const text = [own ?? input.defaultText, input.extra.trim()]
    .filter((p) => p.length > 0)
    .join(' ');
  return {
    text,
    version: createHash('sha1').update(text).digest('hex').slice(0, 8),
    stateCode: own ? state : null,
    kind: input.kind,
  };
}

/** A two-letter state in the request's query or in the payload. */
export function stateOf(
  query: Record<string, unknown> | undefined,
  payload: unknown,
): string | null {
  const pick = (v: unknown): string | null =>
    typeof v === 'string' && STATE_RE.test(v.toUpperCase())
      ? v.toUpperCase()
      : null;
  for (const k of ['stateCode', 'state', 'jurisdiction']) {
    const s = pick(query?.[k]);
    if (s) return s;
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    const nested = p.state;
    return (
      pick(p.stateCode) ??
      pick(p.jurisdiction) ??
      pick(nested) ??
      (nested && typeof nested === 'object'
        ? pick((nested as Record<string, unknown>).code)
        : null)
    );
  }
  return null;
}
