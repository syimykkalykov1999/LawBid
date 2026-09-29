/** docs/01 §10.7 / docs/06 §5.1: anonymization runs after the grace period. */
export const DELETION_GRACE_DAYS = 14;
/** docs/06 §5.2: the download link in the email lives 24 hours. */
export const DATA_EXPORT_LINK_TTL_SEC = 24 * 60 * 60;
/** docs/06 §5.2: user data export queue (BullMQ). */
export const DATA_EXPORT_QUEUE = 'data-export';
export const DATA_EXPORT_JOB = 'data-export.user-data';
export const PRIVACY_OPTIONS = Symbol('PRIVACY_OPTIONS');

export interface PrivacyModuleOptions {
  mode: 'api' | 'worker';
}

/** Text left in place of a deleted user's messages (docs/06 §5.1). */
export const DELETED_MESSAGE_BODY = '[deleted]';
export const DELETED_FIRST_NAME = 'Deleted';
export const DELETED_LAST_NAME = 'User';
