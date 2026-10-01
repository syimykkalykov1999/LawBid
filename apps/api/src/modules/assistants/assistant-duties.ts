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
] as const;
export type AssistantDuty = (typeof ASSISTANT_DUTIES)[number];

/** A new assistant starts with everything but calls (the attorney opts
 * in to ringing assistants). */
export const DEFAULT_DUTIES: readonly AssistantDuty[] = [
  'chats',
  'files',
  'cases',
  'bid_drafts',
  'posts',
  'tasks',
  'profile',
];
