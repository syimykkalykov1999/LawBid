import type { PrismaClient } from '@prisma/client';

/** The write side only: PrismaService and a transaction client both fit. */
type RawWriter = Pick<PrismaClient, '$executeRaw'>;

/** A burst of requests (opening a screen) writes the row once a minute. */
const TOUCH_THROTTLE_SECONDS = 60;

/**
 * OQ-054: the client's OWN action on a case — opening it, viewing its bids,
 * accept / decline / counter, writing in its chat. Moves
 * `cases.client_active_at` to now (the stale-case timers count silence from
 * it). Attorney bids and comments must never call this. Best effort: a
 * failed write never fails the client's request.
 *
 * Edits, answers and restore go through the CaseStateMachine, which writes
 * the column itself.
 */
export async function touchClientActive(
  db: RawWriter,
  caseId: string,
  clientId: string,
): Promise<void> {
  try {
    await db.$executeRaw`
      UPDATE cases SET client_active_at = now()
      WHERE id = ${caseId}::UUID AND client_id = ${clientId}::UUID
        AND deleted_at IS NULL
        AND client_active_at < now() - make_interval(secs => ${TOUCH_THROTTLE_SECONDS})`;
  } catch {
    // Activity tracking is a convenience; the request still succeeds.
  }
}
