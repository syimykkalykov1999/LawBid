/**
 * Owner 2026-10-16: LawBid does not touch the money between a client and an
 * attorney; only subscriptions, offer packs and Boost go through the
 * platform. The flag stays in the table, but it is always read as off and
 * the admin cannot switch it on. (The e2e suites of the dormant feature set
 * CASE_PAYMENTS_UNLOCKED_FOR_TESTS in a test environment.)
 */
export const LOCKED_OFF_FLAGS: readonly string[] = ['payments_in_app'];

export function casePaymentsUnlockedForTests(): boolean {
  return (
    process.env.NODE_ENV === 'test' &&
    process.env.CASE_PAYMENTS_UNLOCKED_FOR_TESTS === '1'
  );
}

export function lockFlags(
  flags: Record<string, boolean>,
): Record<string, boolean> {
  if (casePaymentsUnlockedForTests()) return flags;
  const out = { ...flags };
  for (const k of LOCKED_OFF_FLAGS) if (out[k]) out[k] = false;
  return out;
}
