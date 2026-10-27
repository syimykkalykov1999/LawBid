import { Injectable } from '@nestjs/common';
import { Prisma, type AdminWorkspace } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  agreementPct,
  PEER_DONE,
  PEER_PREFIX,
  returnedRatePct,
} from './staff-review.constants';
import type {
  ReviewCalibrationDto,
  ReviewGoldenListDto,
  ReviewStatsDto,
  ReviewTeamDto,
} from './staff-review.dto';
import type { ReviewAccess } from './staff-review-access.service';

const GOLDEN_LIST = 100;
const TEAM_LIST = 200;
const PEER_WINDOW_DAYS = 30;

const nameOf = (r: { first_name: string | null; last_name: string | null }) =>
  [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'Admin';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** `TRUE` for the owner, the head's workspace otherwise. */
const scopeSql = (alias: string, ws: AdminWorkspace | null) =>
  ws === null
    ? Prisma.sql`TRUE`
    : Prisma.sql`${Prisma.raw(alias)}.workspace = ${ws}::admin_workspace`;

const LATEST = Prisma.sql`s.snapshot_date = (SELECT MAX(snapshot_date) FROM staff_rating_snapshots)`;
const TOTAL = (key: string) =>
  Prisma.sql`COALESCE((s.evidence->'totals'->>${key})::int, 0)`;

/**
 * Staff package T9: the read side of the re-check loop for the owner and the
 * heads — golden tasks, the returned rate per worker, and the numbers per
 * workspace. Only the nightly snapshots (T5) and the small sample tables
 * are read, each endpoint with at most three queries, never a live heavy
 * scan. The owner sees every workspace, a head only their own.
 */
@Injectable()
export class StaffReviewReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Golden tasks, newest first, with the worker's name (owner and head only). */
  async golden(a: ReviewAccess): Promise<ReviewGoldenListDto> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        decision_kind: string;
        status: string;
        verdict: string | null;
        created_at: Date;
        done_at: Date | null;
        decided_by: string;
        first_name: string | null;
        last_name: string | null;
      }>
    >`
      SELECT s.id::text AS id, s.decision_kind, s.status, s.verdict, s.created_at,
             s.done_at, s.decided_by::text AS decided_by, u.first_name, u.last_name
      FROM staff_review_samples s
      JOIN admin_profiles p ON p.user_id = s.decided_by
      JOIN users u ON u.id = s.decided_by
      WHERE s.is_golden = true AND s.status IN ('pending', 'done')
        AND s.created_at > now() - interval '120 days'
        AND ${scopeSql('p', a.workspace)}
      ORDER BY s.created_at DESC
      LIMIT ${GOLDEN_LIST}`;
    return {
      items: rows.map((r) => ({
        id: r.id,
        decisionKind: r.decision_kind,
        state:
          r.status === 'pending'
            ? 'pending'
            : r.verdict === 'same'
              ? 'passed'
              : 'failed',
        worker: { adminId: r.decided_by, name: nameOf(r) },
        createdAt: r.created_at.toISOString(),
        doneAt: r.done_at ? r.done_at.toISOString() : null,
      })),
    };
  }

  /** The head's team view: returned rate per worker (latest nightly snapshot). */
  async team(a: ReviewAccess): Promise<ReviewTeamDto> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        admin_id: string;
        snapshot_date: Date;
        first_name: string | null;
        last_name: string | null;
        decided: number;
        reopened: number;
        complaints: number;
        sampled: number;
        sample_diff: number;
        golden_total: number;
        golden_fail: number;
      }>
    >`
      SELECT s.admin_id::text AS admin_id, s.snapshot_date, u.first_name, u.last_name,
             ${TOTAL('decided')} AS decided, ${TOTAL('reopened')} AS reopened,
             ${TOTAL('complaints')} AS complaints, ${TOTAL('sampled')} AS sampled,
             ${TOTAL('sampleDiff')} AS sample_diff,
             ${TOTAL('goldenTotal')} AS golden_total, ${TOTAL('goldenFail')} AS golden_fail
      FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
      WHERE ${LATEST} AND ${scopeSql('s', a.workspace)}
      ORDER BY (${TOTAL('reopened')} + ${TOTAL('complaints')})::float
               / GREATEST(${TOTAL('decided')}, 1) DESC, s.admin_id
      LIMIT ${TEAM_LIST}`;
    return {
      snapshotDate: day(rows[0]?.snapshot_date ?? null),
      items: rows.map((r) => ({
        adminId: r.admin_id,
        name: nameOf(r),
        decisions: r.decided,
        returnedRate: returnedRatePct(r.decided, r.reopened, r.complaints),
        sampled: r.sampled,
        overturned: r.sample_diff,
        goldenTotal: r.golden_total,
        goldenFailed: r.golden_fail,
      })),
    };
  }

  /**
   * Numbers per workspace: re-checked and overturned (snapshot window),
   * golden results, the queue now — and how often two reviewers agree
   * (last 30 days). Three queries.
   */
  async stats(a: ReviewAccess): Promise<ReviewStatsDto> {
    const [snap, pending, pairs] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          workspace: string;
          snapshot_date: Date;
          decided: number;
          reopened: number;
          complaints: number;
          sampled: number;
          sample_diff: number;
          golden_total: number;
          golden_fail: number;
        }>
      >`
        SELECT s.workspace::text AS workspace, MAX(s.snapshot_date) AS snapshot_date,
               SUM(${TOTAL('decided')})::int AS decided,
               SUM(${TOTAL('reopened')})::int AS reopened,
               SUM(${TOTAL('complaints')})::int AS complaints,
               SUM(${TOTAL('sampled')})::int AS sampled,
               SUM(${TOTAL('sampleDiff')})::int AS sample_diff,
               SUM(${TOTAL('goldenTotal')})::int AS golden_total,
               SUM(${TOTAL('goldenFail')})::int AS golden_fail
        FROM staff_rating_snapshots s
        WHERE ${LATEST} AND ${scopeSql('s', a.workspace)}
        GROUP BY s.workspace`,
      this.prisma.$queryRaw<Array<{ workspace: string; n: number }>>`
        SELECT p.workspace::text AS workspace, COUNT(*)::int AS n
        FROM staff_review_samples s JOIN admin_profiles p ON p.user_id = s.decided_by
        WHERE s.status = 'pending' AND s.is_golden = false
          AND ${scopeSql('p', a.workspace)}
        GROUP BY p.workspace`,
      this.prisma.$queryRaw<
        Array<{ kind: string; pairs: number; agree: number }>
      >`
        SELECT regexp_replace(s.decision_kind, ${`^${PEER_PREFIX}`}, '') AS kind,
               COUNT(*)::int AS pairs,
               (COUNT(*) FILTER (WHERE (s.verdict = 'same')
                                   = (s.golden_answer->>'origVerdict' = 'same')))::int AS agree
        FROM staff_review_samples s JOIN admin_profiles p ON p.user_id = s.decided_by
        WHERE s.status = ${PEER_DONE}
          AND s.created_at > now() - interval '120 days'
          AND s.done_at > now() - make_interval(days => ${PEER_WINDOW_DAYS}::int)
          AND ${scopeSql('p', a.workspace)}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const waiting = new Map(pending.map((p) => [p.workspace, p.n]));
    const workspaces = snap.map((r) => ({
      workspace: r.workspace,
      decisions: r.decided,
      sampled: r.sampled,
      overturned: r.sample_diff,
      overturnRate:
        r.sampled > 0
          ? Math.round((1000 * r.sample_diff) / r.sampled) / 10
          : null,
      returnedRate: returnedRatePct(r.decided, r.reopened, r.complaints),
      goldenTotal: r.golden_total,
      goldenFailed: r.golden_fail,
      pending: waiting.get(r.workspace) ?? 0,
    }));
    // A workspace with a queue but no snapshot yet still shows its queue.
    for (const [workspace, n] of waiting) {
      if (!workspaces.some((w) => w.workspace === workspace)) {
        workspaces.push({
          workspace,
          decisions: 0,
          sampled: 0,
          overturned: 0,
          overturnRate: null,
          returnedRate: null,
          goldenTotal: 0,
          goldenFailed: 0,
          pending: n,
        });
      }
    }
    const calibration: ReviewCalibrationDto[] = pairs.map((p) => ({
      decisionKind: p.kind,
      pairs: p.pairs,
      agreementPct: agreementPct(p.agree, p.pairs),
    }));
    return {
      snapshotDate: day(snap[0]?.snapshot_date ?? null),
      workspaces,
      calibration,
    };
  }
}
