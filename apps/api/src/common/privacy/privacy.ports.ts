/**
 * Owner 2026-10-25 (privacy round 13): seams other modules use to reach the
 * privacy module without importing it (module-boundaries rule: no new
 * module-to-module edges). PrivacyModule provides both tokens.
 */
export const ACCOUNT_ERASER = Symbol('ACCOUNT_ERASER');

export type EraseOutcome = 'erased' | 'held' | 'already' | 'missing';

export interface AccountEraser {
  /** S13-7: erase now, without the 14-day grace period. A legal hold on the
   * person still wins (outcome `held`). Idempotent. */
  eraseNow(userId: string, reason: 'minor_confirmed'): Promise<EraseOutcome>;
}

export const DELETION_NOTICES = Symbol('DELETION_NOTICES');

export interface DeletionNotices {
  /** S13-14: the day-0 confirmation (push + e-mail with a cancel link). */
  onRequested(userId: string): Promise<void>;
}
