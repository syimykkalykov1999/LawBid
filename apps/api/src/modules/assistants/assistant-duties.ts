/**
 * OQ-048: what an attorney gives each assistant. One duty may go to
 * several assistants and one assistant may hold several.
 * - calls: incoming calls to the attorney also ring this assistant;
 * - chats: read and write the attorney's chats (as "Assistant of …");
 * - files: send / receive documents and photos in chats;
 * - cases: browse, save and comment cases;
 * - bid_drafts: prepare bid drafts (only the attorney sends);
 * - posts: prepare posts / news (published after approval);
 * - tasks: set tasks for the attorney;
 * - profile: propose profile edits (applied after approval).
 *
 * OQ-049 (owner 2026-10-01) — granted only with the attorney's written
 * acceptance of full responsibility ([LIABILITY_DUTIES]):
 * - bids: place bids and negotiate (counter, accept, decline, withdraw)
 *   in the attorney's name;
 * - publish: publish posts / news / comments without approval.
 * - qa_answers (R-401, owner 2026-11-04): answer clients' questions in
 *   «Вопрос юристу» in the attorney's name — the answer is published under
 *   the attorney's profile (likes and the ranking go to the attorney), the
 *   row keeps who typed it (legal_answers.authored_by_user_id).
 */
export const ASSISTANT_DUTIES = [
  'calls',
  'chats',
  'files',
  'cases',
  'bid_drafts',
  'posts',
  'tasks',
  'profile',
  'bids',
  'publish',
  'qa_answers',
] as const;
export type AssistantDuty = (typeof ASSISTANT_DUTIES)[number];

/** Owner 2026-10-01 (OQ-049): a new assistant starts with no access — the
 * attorney switches on each duty and accepts responsibility for it. */
export const DEFAULT_DUTIES: readonly AssistantDuty[] = [];

/** Owner 2026-10-01: every access is granted only after the attorney
 * accepts responsibility for what the assistant does with it. */
export const LIABILITY_DUTIES: readonly AssistantDuty[] = ASSISTANT_DUTIES;

/** Owner 2026-10-22: one assistant holds at most this many duties unless
 * the admin sets `assistants.max_duties` — more assistants, nobody with
 * the whole account. R-401 (owner 2026-11-04 13:15): the same setting,
 * now «Макс. ролей у одного помощника»; 0 = «все» (no limit). */
export const DEFAULT_MAX_DUTIES = 3;
export const MAX_DUTIES_UNLIMITED = 0;

/** The admin value as the number of duties: 1..all; 0 («все») and a broken
 * value above the catalog = every duty; another broken value = 3. */
export function clampMaxDuties(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.floor(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_MAX_DUTIES;
  if (n === MAX_DUTIES_UNLIMITED) return ASSISTANT_DUTIES.length;
  return Math.min(ASSISTANT_DUTIES.length, Math.max(1, n));
}

/** «все»: the admin switched the limit off (the app hides the counter). */
export function isUnlimitedDuties(raw: unknown): boolean {
  return typeof raw === 'number' && Math.floor(raw) === MAX_DUTIES_UNLIMITED;
}

/** Bumped when the warning text changes (stored with each acceptance). */
export const LIABILITY_TERMS_VERSION = '2026-10-01';
