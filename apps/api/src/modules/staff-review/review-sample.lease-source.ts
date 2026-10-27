import { Prisma } from '@prisma/client';
import { ROLE_ITEM_KINDS } from '../staff-rating/staff-sampling.service';
import type { LeaseQueueSource } from '../work-lease/lease-queue-sources';
import { PEER_PREFIX, REVIEW_LEASE_KIND } from './staff-review.constants';

/** Stage order of the queue: newcomers first, then random picks, AI
 * disagreements, and the peer copies last. */
const STAGE_RANK = Prisma.sql`CASE s.stage
  WHEN 'newcomer' THEN 0 WHEN 'sample' THEN 1 WHEN 'ai' THEN 2 ELSE 3 END`;

/**
 * Staff package T9: the re-check samples as a queue of the lease engine
 * (kind `review_sample`, item = the sample id), so two reviewers never get
 * the same sample. A reviewer is offered a pending sample of their scope
 * (the owner: everything; a head: their workspace; a senior: their
 * workspace and only the kinds of their own role), never their own
 * decision, never a peer copy of their own verdict. The queue's own switch
 * is `staff.sampling_enabled` (and `staff.lease_enabled`).
 */
export const reviewSampleSource: LeaseQueueSource = {
  kind: REVIEW_LEASE_KIND,
  routePath: '/admin/workspace/review/next',
  switch: 'staff.sampling_enabled',
  ttlSetting: 'staff.lease.ttl_appeal_min',
  async candidates(tx, q) {
    const me = await tx.adminProfile.findUnique({
      where: { user_id: q.adminId },
      select: { admin_role: true, workspace: true, is_workspace_head: true },
    });
    if (!me) return [];
    const wide =
      me.admin_role === 'super_admin' ||
      me.workspace === 'owner' ||
      me.is_workspace_head;
    const kinds = [...ROLE_ITEM_KINDS[me.admin_role]];
    const wholeWorld =
      me.admin_role === 'super_admin' || me.workspace === 'owner';
    return tx.$queryRaw<Array<{ id: string }>>`
      SELECT s.id::text AS id
      FROM staff_review_samples s
      JOIN admin_profiles dp ON dp.user_id = s.decided_by
      WHERE s.status = 'pending' AND s.is_golden = false AND s.reviewer_id IS NULL
        AND s.decided_by <> ${q.adminId}::uuid
        AND COALESCE(s.golden_answer->>'origReviewer', '') <> ${q.adminId}
        AND (${wholeWorld}::boolean OR dp.workspace = ${me.workspace}::admin_workspace)
        AND (${wide}::boolean
             OR regexp_replace(s.decision_kind, ${`^${PEER_PREFIX}`}, '') = ANY(${kinds}::text[]))
        AND NOT EXISTS (
          SELECT 1 FROM work_leases wl
          WHERE wl.kind = ${REVIEW_LEASE_KIND} AND wl.item_id = s.id
            AND ((wl.admin_id IS NOT NULL AND wl.leased_until > now())
              OR (${q.adminId}::uuid = ANY(COALESCE(wl.excluded_admin_ids, ARRAY[]::uuid[]))
                  AND wl.updated_at > now() - make_interval(mins => ${q.excludeMinutes}::int)))
        )
      ORDER BY COALESCE((SELECT wl.priority FROM work_leases wl
                 WHERE wl.kind = ${REVIEW_LEASE_KIND} AND wl.item_id = s.id), 0) DESC,
               ${STAGE_RANK} ASC, s.created_at ASC, s.id ASC
      LIMIT ${q.limit}`;
  },
  async onClaimed(tx, _adminId, itemId) {
    return (
      (await tx.staffReviewSample.count({
        where: { id: itemId, status: 'pending', reviewer_id: null },
      })) > 0
    );
  },
};
