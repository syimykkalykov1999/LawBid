import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface PersonName {
  first_name: string | null;
  last_name: string | null;
}

/** Marks the system-created verification request of a name re-check
 * (admin_note; docs/03 §10 adds no dedicated column). */
export const NAME_RECHECK_NOTE_PREFIX = 'name_change_recheck';

/** Request statuses that count as "the attorney already has an open
 * request" (docs/03 §2.3: one at a time). */
const OPEN_REQUEST_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'needs_more_info',
] as const;

export function nameChanged(before: PersonName, after: PersonName): boolean {
  return (
    (before.first_name ?? '') !== (after.first_name ?? '') ||
    (before.last_name ?? '') !== (after.last_name ?? '')
  );
}

/**
 * docs/03 §4.1: "после верификации изменение имени отправляет профиль на
 * повторную проверку (`pending`), чтобы имя совпадало с документами".
 *
 * Call inside the transaction that writes the new name. When a
 * `verified` attorney's first/last name changes, the profile goes to
 * `pending` and — unless a request is already open — a `submitted`
 * verification request lands in the verifier queue (§2.5) with the old
 * and new names in admin_note, so a human compares them with the
 * documents on file. Licenses keep their status. Returns true when the
 * re-check was started.
 */
export async function startNameRecheckIfVerified(
  tx: Tx,
  userId: string,
  before: PersonName,
  after: PersonName,
  now: Date = new Date(),
): Promise<boolean> {
  if (!nameChanged(before, after)) return false;
  const { count } = await tx.attorneyProfile.updateMany({
    where: { user_id: userId, verification_status: 'verified' },
    data: { verification_status: 'pending' },
  });
  if (count === 0) return false;
  const open = await tx.verificationRequest.findFirst({
    where: { attorney_id: userId, status: { in: [...OPEN_REQUEST_STATUSES] } },
    select: { id: true },
  });
  if (!open) {
    await tx.verificationRequest.create({
      data: {
        attorney_id: userId,
        status: 'submitted',
        submitted_at: now,
        admin_note: `${NAME_RECHECK_NOTE_PREFIX}: "${fullName(before)}" -> "${fullName(after)}"`,
      },
    });
  }
  return true;
}

function fullName(n: PersonName): string {
  return [n.first_name, n.last_name].filter(Boolean).join(' ');
}
