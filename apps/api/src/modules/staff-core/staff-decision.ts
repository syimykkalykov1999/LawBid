import { Logger } from '@nestjs/common';
import type { LeasePort } from './lease.port';
import type { StaffRecorder } from './staff-recorder.port';

const log = new Logger('StaffDecision');

export interface ClosedDecision {
  /** The staff member who took the decision. */
  adminId: string;
  /** work_leases.kind: support_ticket · verification · report · mod_appeal · review_appeal. */
  kind: string;
  itemId: string;
  /** approve · reject · request_info · close · accept · … (as the rating recorder spells them). */
  outcome: string;
  /** The item kind the rating recorder knows it by, when that differs from the lease kind. */
  recordKind?: string;
}

/**
 * Staff package T4: what a queue service does the moment a person closes an
 * item with a decision — end their work lease (while the queue is served by
 * leases) and report the decision to the rating recorder (T5; a no-op until
 * it is bound or while its switch is off; leave `recorder` out where the
 * queue already reports to the recorder itself). One call from the service,
 * AFTER its own transaction committed. Best effort by design: the decision itself
 * is already done and must never fail because of bookkeeping.
 */
export async function closeStaffDecision(
  deps: { lease?: LeasePort; recorder?: StaffRecorder },
  d: ClosedDecision,
): Promise<void> {
  let handleMs: number | undefined;
  try {
    if (deps.lease && (await deps.lease.servesQueue(d.kind))) {
      const held = await deps.lease.done(
        d.kind,
        d.itemId,
        d.adminId,
        d.outcome,
      );
      if (held !== null) handleMs = held;
    }
  } catch (e) {
    log.warn(`lease.done ${d.kind}:${d.itemId} failed: ${String(e)}`);
  }
  try {
    await deps.recorder?.record({
      adminId: d.adminId,
      itemKind: d.recordKind ?? d.kind,
      itemId: d.itemId,
      outcome: d.outcome,
      ...(handleMs !== undefined ? { handleMs } : {}),
    });
  } catch (e) {
    log.warn(`record ${d.kind}:${d.itemId} failed: ${String(e)}`);
  }
}

/**
 * «Не решено»: the client came back to an item a worker had closed. Puts it
 * first in line again and keeps the previous worker away from it for a while
 * (LeaseService.reopen). Best effort, a no-op while leases are off.
 */
export async function reopenStaffItem(
  lease: LeasePort | undefined,
  kind: string,
  itemId: string,
): Promise<void> {
  try {
    if (lease && (await lease.servesQueue(kind))) {
      await lease.reopen(kind, itemId);
    }
  } catch (e) {
    log.warn(`lease.reopen ${kind}:${itemId} failed: ${String(e)}`);
  }
}
