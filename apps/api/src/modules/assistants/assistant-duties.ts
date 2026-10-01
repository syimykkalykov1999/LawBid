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
] as const;
export type AssistantDuty = (typeof ASSISTANT_DUTIES)[number];

/** Owner 2026-10-01 (OQ-049): a new assistant starts with no access — the
 * attorney switches on each duty and accepts responsibility for it. */
export const DEFAULT_DUTIES: readonly AssistantDuty[] = [];

/** Owner 2026-10-01: every access is granted only after the attorney
 * accepts responsibility for what the assistant does with it. */
export const LIABILITY_DUTIES: readonly AssistantDuty[] = ASSISTANT_DUTIES;

/** Bumped when the warning text changes (stored with each acceptance). */
export const LIABILITY_TERMS_VERSION = '2026-10-01';
