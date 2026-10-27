/**
 * Staff package T4: golden tasks as the lease engine sees them. A golden
 * task is an item whose right answer is already known (T5 keeps them in
 * `staff_review_samples`, `is_golden`); it is handed out through the same
 * «Следующий» and the same lease as a real item, so the worker cannot tell.
 * The staff-desk module binds LEASE_GOLDEN; without it nothing is served.
 */
export const LEASE_GOLDEN = Symbol('LEASE_GOLDEN');

export interface LeaseGolden {
  /** The item id of a golden task of [kind] waiting for [adminId], or null. */
  pick(adminId: string, kind: string): Promise<string | null>;
  /** [adminId] closed [itemId] with [outcome]: if it was a golden task, check it. */
  resolve(
    adminId: string,
    kind: string,
    itemId: string,
    outcome: string,
  ): Promise<void>;
}
