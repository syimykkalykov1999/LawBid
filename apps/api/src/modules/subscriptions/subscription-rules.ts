/**
 * docs/06 §1.2 — the pure "this subscription row gives access" rule,
 * shared by SubscriptionAccessService, the sync service and the
 * entitlements gate (owner 2026-10-05) without a service import cycle.
 * True for `trialing` / `active`, or `past_due` inside the grace period.
 */
export function subscriptionRowIsActive(
  row: { status: string; grace_ends_at: Date | null } | null,
  now = new Date(),
): boolean {
  if (!row) return false;
  if (row.status === 'trialing' || row.status === 'active') return true;
  return (
    row.status === 'past_due' && !!row.grace_ends_at && row.grace_ends_at > now
  );
}
