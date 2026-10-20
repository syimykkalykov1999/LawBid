/**
 * Owner 2026-10-15: how many characters each free-text field takes. One
 * list, edited in the admin panel (Config → «Лимиты ввода»), enforced on
 * the SERVER (the source of truth) and mirrored in the app, which shows a
 * counter and stops typing at the same number.
 *
 * `def` is what the product did before this list existed; `min` / `max`
 * are the bounds the admin may set (`max` is also what the database
 * columns and the request validators accept, so a limit can only be
 * raised as far as the data layer allows).
 */
export const TEXT_LIMIT_DEFS = {
  // Owner 2026-10-19: starter values as in Instagram (DM 1000, comment and
  // caption 2200, bio 150, name 30); the admin may change every one.
  'limits.chat_message_chars': {
    def: 1000,
    min: 1,
    max: 10_000,
    label: 'A chat message',
  },
  'limits.comment_chars': {
    def: 2200,
    min: 1,
    max: 5000,
    label: 'A comment under a post, reel or case',
  },
  'limits.post_title_chars': {
    def: 120,
    min: 1,
    max: 300,
    label: 'The title of a post or reel',
  },
  'limits.case_title_chars': {
    def: 120,
    min: 1,
    max: 300,
    label: 'The title of a case',
  },
  'limits.case_description_chars': {
    def: 5000,
    min: 1,
    max: 20_000,
    label: 'The description of a case',
  },
  'limits.case_private_details_chars': {
    def: 10_000,
    min: 1,
    max: 50_000,
    label:
      'The private details of a case (only the accepted attorney sees them)',
  },
  'limits.bid_message_chars': {
    def: 2000,
    min: 1,
    max: 10_000,
    label: "An attorney's offer message",
  },
  'limits.counter_message_chars': {
    def: 500,
    min: 1,
    max: 2000,
    label: 'A counter-offer message',
  },
  'limits.review_chars': {
    def: 1000,
    min: 1,
    max: 5000,
    label: 'The text of a review',
  },
  'limits.dispute_chars': {
    def: 1000,
    min: 1,
    max: 5000,
    label: 'A dispute or completion note',
  },
  'limits.workspace_note_chars': {
    def: 1000,
    min: 1,
    max: 1000, // the column holds 1000
    label: 'A note with files in a case workspace',
  },
  'limits.workspace_update_chars': {
    def: 5000,
    min: 1,
    max: 20_000,
    label: 'A status update in a case workspace',
  },
  'limits.support_message_chars': {
    def: 5000,
    min: 1,
    max: 20_000,
    label: 'A message to support',
  },
  'limits.bio_chars': {
    def: 150,
    min: 1,
    max: 1000,
    label: "An attorney's bio",
  },
  'limits.question_title_chars': {
    def: 120,
    min: 5,
    max: 160, // the column holds 160
    label: 'The title of a question to a lawyer',
  },
  'limits.question_body_chars': {
    def: 1500,
    min: 10,
    max: 3000, // the column holds 3000
    label: 'The text of a question to a lawyer',
  },
  'limits.answer_chars': {
    def: 2000,
    min: 10,
    max: 4000, // the column holds 4000
    label: "A lawyer's answer to a question",
  },
  'limits.consultation_note_chars': {
    def: 300,
    min: 1,
    max: 500, // the column holds 500
    label: 'What the client wants to discuss in a booked consultation',
  },
  'limits.name_chars': {
    def: 30,
    min: 1,
    max: 50, // PERSON_NAME_MAX_LENGTH / ATTORNEY_NAME_MAX
    label: 'A first or last name',
  },
} as const;

export type TextLimitKey = keyof typeof TEXT_LIMIT_DEFS;

/** The starter values, merged into the app settings (and seeded). */
export const OWNER_TEXT_LIMIT_SETTINGS = Object.fromEntries(
  Object.entries(TEXT_LIMIT_DEFS).map(([k, v]) => [k, v.def]),
) as { [K in TextLimitKey]: number };

/** The most any validator or column must accept for [key]. */
export const textLimitCeiling = (key: TextLimitKey): number =>
  TEXT_LIMIT_DEFS[key].max;
