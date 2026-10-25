/**
 * Owner 2026-10-22 (audit #4 §5, App Store guideline 1.2): automated
 * moderation of public images and reel thumbnails.
 */

/** BullMQ queue of the checks (one job per file / video asset). */
export const MEDIA_MODERATION_QUEUE = 'media-moderation';
export const MEDIA_CHECK_JOB = 'media.check';
/** A hidden verdict whose content was not posted yet is applied again. */
export const MEDIA_REHIDE_JOB = 'media.rehide';
export const MEDIA_MODERATION_OPTIONS = Symbol('MEDIA_MODERATION_OPTIONS');

export interface MediaModerationModuleOptions {
  mode: 'api' | 'worker';
}

/** Public user content that is checked: what other people see. Private
 * files (chat, cases, documents) are never sent to a third party. */
export const MODERATED_PURPOSES = [
  'post_image',
  'avatar',
  'review_photo',
  // Owner 2026-10-28 (legal safety): a user's sticker image is public to
  // everyone who installs the pack — scanned before it is published.
  'sticker',
] as const;
export type ModeratedPurpose = (typeof MODERATED_PURPOSES)[number];

export function isModeratedPurpose(p: string): p is ModeratedPurpose {
  return (MODERATED_PURPOSES as readonly string[]).includes(p);
}

/** Verdicts that keep content off the app until a moderator approves. */
export const BLOCKING_STATUSES = ['hidden', 'csam_match'] as const;

/** Statuses the admin queue lists. */
export const QUEUE_STATUSES = ['flagged', 'hidden', 'csam_match'] as const;

/** Rekognition caps the image at 5 MB; the check uses a 1600 px JPEG. */
export const CHECK_MAX_PX = 1600;
/** Delay before a hidden verdict is applied once more (the photo may be
 * attached to a post only after the check finished). */
export const REHIDE_DELAY_MS = 10 * 60 * 1000;

export interface ModerationLabel {
  name: string;
  parent: string | null;
  confidence: number;
}
