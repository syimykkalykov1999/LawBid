/**
 * Owner 2026-10-28: mass review «…и дальше». Pure rules of the review
 * screen (no React, no data) so the screen, the desk and the tests share
 * one source. Research (2025–2026): Zendesk Play / Guided mode — submit
 * opens the next ticket of the view nobody else is viewing, a skip may need
 * a reason; Stripe Radar reviews — Previous / Next inside the queue and
 * keyboard shortcuts; annotation queues (Langfuse 2026-06) — single-key
 * shortcuts with a visible hint. Here: the lease engine hands the next item
 * (one per worker), the old queue order is the fallback, and only the
 * single most likely next item is warmed up in the background.
 */

/** Where the review screens live (the desk and the lists open them). */
export const VERIFICATION_REVIEW_PATH = '/verification/review';
export const MODERATION_REVIEW_PATH = '/moderation/review';

export function verificationReviewHref(id?: string | null): string {
  return id ? `${VERIFICATION_REVIEW_PATH}?id=${encodeURIComponent(id)}` : VERIFICATION_REVIEW_PATH;
}

export function moderationReviewHref(type?: string | null, id?: string | null): string {
  if (!type || !id) return MODERATION_REVIEW_PATH;
  return `${MODERATION_REVIEW_PATH}?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
}

/** The one-key shortcuts of a review screen (owner: A, R, N, Esc). */
export type ReviewKey = 'approve' | 'reject' | 'next';

export const REVIEW_KEYS: Readonly<Record<string, ReviewKey>> = {
  a: 'approve',
  ф: 'approve',
  r: 'reject',
  к: 'reject',
  n: 'next',
  т: 'next',
};

/** The hint under the buttons. */
export const REVIEW_HINT: readonly { key: string; text: string }[] = [
  { key: 'A', text: 'одобрить' },
  { key: 'R', text: 'отклонить' },
  { key: 'N', text: 'пропустить' },
  { key: 'Esc', text: 'закрыть просмотр' },
];

/** The same keys by their place on the keyboard (any layout). */
const REVIEW_CODES: Readonly<Record<string, ReviewKey>> = { KeyA: 'approve', KeyR: 'reject', KeyN: 'next' };

interface KeyLike {
  key: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
}

/** Does the key belong to a field the person is typing into? */
function typing(target: EventTarget | null | undefined): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null | undefined;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/**
 * The review action of a key press, or null. Never while typing, with a
 * modifier (Ctrl+R stays «reload»), on auto-repeat, or while a dialog
 * (reason, confirm, lightbox) is open — the dialog owns the keyboard then.
 */
export function reviewKeyOf(e: KeyLike, dialogOpen: boolean): ReviewKey | null {
  if (dialogOpen || e.altKey || e.ctrlKey || e.metaKey || e.repeat || typing(e.target)) return null;
  return (e.code ? REVIEW_CODES[e.code] : undefined) ?? REVIEW_KEYS[e.key.toLowerCase()] ?? null;
}

/** Is a modal (reason / confirm dialog, lightbox) on screen? */
export function dialogOnScreen(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  return !!doc?.querySelector('[role="dialog"]');
}

// --- verification documents -------------------------------------------------

export interface ReviewDoc {
  id: string;
  docType: string;
  side?: string | null;
  mime: string;
  scanStatus: string;
}

const ID_TYPES = ['passport', 'drivers_license', 'state_id'];

/** The ID document (front, then back), the selfie and everything else. */
export function splitDocs<T extends ReviewDoc>(docs: readonly T[]): { id: T[]; selfie: T[]; other: T[] } {
  const side = (d: T) => (d.side === 'front' ? 0 : d.side === 'back' ? 1 : 2);
  return {
    id: docs.filter((d) => ID_TYPES.includes(d.docType)).sort((a, b) => side(a) - side(b)),
    selfie: docs.filter((d) => d.docType === 'selfie'),
    other: docs.filter((d) => !ID_TYPES.includes(d.docType) && d.docType !== 'selfie'),
  };
}

/** A document the screen shows as a picture (others open by link). */
export function isViewableImage(d: ReviewDoc): boolean {
  return d.scanStatus === 'clean' && d.mime.startsWith('image/');
}

/**
 * The X-Justification of a document opened on the review screen. The view
 * is still one audited signed link per document (docs/06 §2.1); the reason
 * is the review of this request, written by the screen.
 */
export function reviewJustification(requestId: string): string {
  return `Проверка заявки на верификацию ${requestId.slice(0, 8)} (экран проверки)`;
}

/** How long a signed link may be reused: until 30 s before it ends. */
export function linkFreshMs(expiresAt: string | undefined, now = Date.now()): number {
  if (!expiresAt) return 0;
  return Math.max(0, new Date(expiresAt).getTime() - now - 30_000);
}

// --- choosing the next item without the lease engine -------------------------

/**
 * The most likely next item from the queue list (oldest first): not the one
 * on screen, not one already decided or skipped here. [usable] drops what
 * the person cannot work (another verifier's request, waiting for the
 * attorney…).
 */
export function pickNext<T>(list: readonly T[], keyOf: (t: T) => string, current: string | null, seen: ReadonlySet<string>, usable: (t: T) => boolean = () => true): T | null {
  return list.find((t) => keyOf(t) !== current && !seen.has(keyOf(t)) && usable(t)) ?? null;
}
