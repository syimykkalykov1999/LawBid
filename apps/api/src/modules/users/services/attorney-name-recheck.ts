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
/** Letters only, lower case, accents stripped: "Jöhn-Paul" → ["john","paul"]. */
function tokens(name: PersonName): string[] {
  return `${name.first_name ?? ''} ${name.last_name ?? ''}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = d[j];
      d[j] = Math.min(
        d[j] + 1,
        d[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return d[b.length];
}

/**
 * Owner decision 2026-09-30 (OQ-029): is [after] still "the same person"
 * as the verified name? True for typo fixes (1 edit for words ≤ 5 letters,
 * 2 for longer), letter case, accents, swapped order and one added word
 * (a middle name). False for a different name.
 */
export function namesClose(verified: PersonName, after: PersonName): boolean {
  const v = tokens(verified);
  const a = tokens(after);
  if (v.length === 0) return true;
  if (a.length > v.length + 1) return false;
  const pool = [...a];
  for (const word of v) {
    const limit = word.length <= 5 ? 1 : 2;
    const hit = pool.findIndex((x) => distance(word, x) <= limit);
    if (hit < 0) return false;
    pool.splice(hit, 1);
  }
  return true;
}

/**
 * Owner decision 2026-09-30 (OQ-029): a name change NEVER blocks an
 * attorney (no `pending`, no verification gate, no admin queue). Instead,
 * compared with the name the attorney was verified under, a big change sets
 * `name_mismatch` and the blue check hides itself everywhere; changing the
 * name back (or close to it) brings the check back. Returns true when the
 * check got hidden by this change.
 */
export async function startNameRecheckIfVerified(
  tx: Tx,
  userId: string,
  before: PersonName,
  after: PersonName,
): Promise<boolean> {
  if (!nameChanged(before, after)) return false;
  const row = await tx.attorneyProfile.findUnique({
    where: { user_id: userId },
    select: { verified_first_name: true, verified_last_name: true },
  });
  if (
    !row ||
    (row.verified_first_name === null && row.verified_last_name === null)
  ) {
    return false;
  }
  const mismatch = !namesClose(
    { first_name: row.verified_first_name, last_name: row.verified_last_name },
    after,
  );
  await tx.attorneyProfile.update({
    where: { user_id: userId },
    data: { name_mismatch: mismatch },
  });
  return mismatch;
}
