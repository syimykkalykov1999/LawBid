import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface PersonName {
  first_name: string | null;
  last_name: string | null;
}

/** Marks the system-created verification request of a name re-check
 * (admin_note; docs/03 §10 adds no dedicated column). */
export const NAME_RECHECK_NOTE_PREFIX = 'name_change_recheck';

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
/**
 * Owner decision 2026-09-30 (OQ-029): a name change NEVER resets a verified
 * attorney's status — the owner found the docs/03 §4.1 re-check wrong ("the
 * attorney bought a subscription, fixed a typo in the name a month later and
 * was locked out"). Kept as a no-op so call sites and the verifier-queue
 * filter (NAME_RECHECK_NOTE_PREFIX) stay in place; admins still see the
 * current name next to the documents in the admin panel.
 */
export function startNameRecheckIfVerified(
  _tx: Tx,
  _userId: string,
  before: PersonName,
  after: PersonName,
  now: Date = new Date(),
): Promise<boolean> {
  void nameChanged(before, after);
  void now;
  return Promise.resolve(false);
}
