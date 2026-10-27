/**
 * Staff package T5: the quality-signal side of the recorder. Services call
 * it when something happens AFTER an admin closed an item (a complaint, an
 * appeal, a repeat ticket, a thumb from the user, a re-check verdict). One
 * cheap fire-and-forget call each; it never throws into the caller's
 * request and is a no-op while `staff.rating_enabled` is off. T5 binds
 * STAFF_SIGNALS to the real recorder (modules/staff-rating); until then
 * (and in unit specs) the callers' `@Optional()` injection stays empty.
 */
export const STAFF_SIGNALS = Symbol('STAFF_SIGNALS');

/** staff_quality_signals.kind. */
export type StaffSignalKind =
  | 'reopened'
  | 'complaint'
  | 'appeal_won'
  | 'overturned'
  | 'csat_up'
  | 'csat_down'
  | 'sample_diff'
  | 'golden_pass'
  | 'golden_fail'
  | 'too_fast'
  | 'late_sla'
  | 'lease_lost';

export interface StaffSignals {
  /** A signal about one decision of [adminId]. */
  signal(
    adminId: string,
    kind: StaffSignalKind,
    itemKind: string,
    itemId: string,
  ): Promise<void>;
  /** The same, for the admin who took moderation action [actionId]
   * (looked up only when the rating is on). */
  signalForModerationAction(
    actionId: string,
    kind: StaffSignalKind,
    itemKind: string,
    itemId: string,
  ): Promise<void>;
}
