/** docs/01 §10.7 / docs/06 §5.1: anonymization runs after the grace period. */
export const DELETION_GRACE_DAYS = 14;
/** docs/06 §5.2: the download link in the email lives 24 hours. */
export const DATA_EXPORT_LINK_TTL_SEC = 24 * 60 * 60;
/** docs/06 §5.2: user data export queue (BullMQ). */
export const DATA_EXPORT_QUEUE = 'data-export';
/** S10-3: a `processing` export untouched for this long is dead (no live
 * build takes 20 minutes) — a retry or a new request may take it over. */
export const DATA_EXPORT_STALE_PROCESSING_MS = 20 * 60 * 1000;
export const DATA_EXPORT_JOB = 'data-export.user-data';
export const PRIVACY_OPTIONS = Symbol('PRIVACY_OPTIONS');

export interface PrivacyModuleOptions {
  mode: 'api' | 'worker';
}

/** Text left in place of a deleted user's messages (docs/06 §5.1). */
export const DELETED_MESSAGE_BODY = '[deleted]';
export const DELETED_FIRST_NAME = 'Deleted';
export const DELETED_LAST_NAME = 'User';

/**
 * Owner 2026-10-22 (audit #4 §5, GDPR Art. 17): every file purpose that
 * holds the person's own content is released when the account is
 * anonymized. Not here: `data_export` (expires on its own),
 * `document_template` (admin content), `sticker` (packs others use) and
 * `task_attachment` (the attorney's planner purge owns them).
 */
export const ANONYMIZED_FILE_PURPOSES = [
  'avatar',
  'verification_document',
  'verification_selfie',
  // OQ-040: voice notes are the sender's messages — gone too.
  'chat_voice',
  // OQ-047: files the user sent in chats.
  'chat_attachment',
  'post_image',
  'post_video',
  'post_attachment',
  'case_photo',
  'case_attachment',
  'review_photo',
  'support_attachment',
] as const;

/** Owner 2026-10-22: one BullMQ job per account to anonymize (retries,
 * one bad account never blocks the others). */
export const ACCOUNT_DELETION_QUEUE = 'account-deletion';
export const ACCOUNT_DELETION_JOB = 'privacy.anonymize-user';
