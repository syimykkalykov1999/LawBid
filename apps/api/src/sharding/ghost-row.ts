/**
 * Shard-ready step 9: after the cross-family foreign keys are dropped, a
 * REQUIRED to-one relation (review.client, bid.attorney ...) can point at a
 * row that no longer exists. Prisma would never have returned that; code
 * written for it reads `row.client.first_name` without a null check. The
 * stitcher and the user directory therefore hand back a "ghost": the
 * selected fields, all null, so the endpoint renders an empty name instead
 * of crashing with a 500. The nightly orphan checker reports the real
 * dangling reference (`cross_family_orphans`).
 */
export function ghostRow(select: unknown): Record<string, null> | null {
  if (!select || typeof select !== 'object' || Array.isArray(select)) {
    return null;
  }
  const out: Record<string, null> = {};
  for (const [key, on] of Object.entries(select as Record<string, unknown>)) {
    if (on) out[key] = null;
  }
  return out;
}
