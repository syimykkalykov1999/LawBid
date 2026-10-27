/**
 * Staff package T1: queues report each closed decision here (T4 calls it
 * when a staff member closes an item); T5 implements it in
 * modules/staff-rating (Redis counters + staff_quality_signals) and binds
 * STAFF_RECORDER. Until then the no-op drops it. Never throws into the
 * caller's request: recording is best effort.
 */
export const STAFF_RECORDER = Symbol('STAFF_RECORDER');

export interface StaffDecisionEvent {
  adminId: string;
  /** support_ticket · verification · report · … (work_leases.kind). */
  itemKind: string;
  itemId: string;
  /** e.g. approve · reject · reply · close. */
  outcome: string;
  /** Milliseconds from take to close, when known. */
  handleMs?: number;
}

export interface StaffRecorder {
  record(event: StaffDecisionEvent): Promise<void>;
}

export class NoopStaffRecorder implements StaffRecorder {
  record(): Promise<void> {
    return Promise.resolve();
  }
}
