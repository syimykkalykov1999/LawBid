import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  SIGNAL_KIND,
  SIGNAL_SOURCE,
  since,
  type SignalCode,
} from './staff-appeals.logic';

type Db = Pick<PrismaService, 'staffAction'> | Prisma.TransactionClient;

export interface SignalInput {
  code: SignalCode;
  /** The person the signal is about (the head for head-level signals). */
  subjectId: string;
  /** Who acted (the head who removed someone), null for the system. */
  actorId?: string | null;
  /** Identity of this very event: the same key is written once per window. */
  ref: string;
  /** Do not write the same (subject, code, ref) again for this many days. */
  dedupeDays: number;
  details?: Prisma.InputJsonObject;
  now: Date;
}

/**
 * Staff package T6 (research 3.2/3.4): an owner-inbox signal is a
 * `staff_actions` row (kind `signal`, source `system`, the code in
 * `reason_code`, the event identity in `reason_note`, the numbers in
 * `rating_snapshot`). A signal never blocks anything. Idempotent per
 * (subject, code, ref) inside the dedupe window; returns true when written.
 */
export async function emitSignal(db: Db, s: SignalInput): Promise<boolean> {
  const seen = await db.staffAction.findFirst({
    where: {
      admin_id: s.subjectId,
      kind: SIGNAL_KIND,
      reason_code: s.code,
      reason_note: s.ref,
      created_at: { gte: since(s.now, s.dedupeDays) },
    },
    select: { id: true },
  });
  if (seen) return false;
  await db.staffAction.create({
    data: {
      admin_id: s.subjectId,
      actor_id: s.actorId ?? null,
      source: SIGNAL_SOURCE,
      kind: SIGNAL_KIND,
      reason_code: s.code,
      reason_note: s.ref,
      rating_snapshot: s.details ?? {},
      created_at: s.now,
    },
  });
  return true;
}
