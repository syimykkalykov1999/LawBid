import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import {
  headScore,
  multiAppeals,
  REMOVAL_KINDS,
  SIGNAL,
  since,
  startOfUtcDay,
  turnoverExceeded,
} from './staff-appeals.logic';
import { emitSignal } from './staff-signals';

const TURNOVER_DAYS = 30;

export interface HeadScoreResult {
  heads: number;
  signals: number;
}

/**
 * Staff package T6, job `staff.head-score` (55 1 * * * UTC): the nightly
 * score of every workspace head into `staff_head_snapshots` (team quality
 * from the latest rating snapshots — empty until the rating engine runs —,
 * turnover, complaints; weights from the settings, re-spread over the parts
 * that exist) and the head-level signals (team turnover, two complaints
 * from different people). Reads only indexed ranges; one head per loop, a
 * handful of heads.
 */
@Injectable()
export class StaffHeadScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
  ) {}

  async run(now = new Date()): Promise<HeadScoreResult> {
    const { numbers: n } = await this.staff.get();
    const heads = await this.prisma.adminProfile.findMany({
      where: { is_workspace_head: true },
      select: { user_id: true, workspace: true },
      take: 200,
    });
    const day = startOfUtcDay(now);
    const ratingDate = await this.prisma.staffRatingSnapshot.findFirst({
      orderBy: { snapshot_date: 'desc' },
      select: { snapshot_date: true },
    });
    let signals = 0;
    for (const h of heads) {
      const team = await this.prisma.adminProfile.findMany({
        where: {
          workspace: h.workspace,
          is_workspace_head: false,
          admin_role: { not: 'super_admin' },
        },
        select: { user_id: true },
        take: n['staff.head.max_admins'] * 4,
      });
      const [removed, complainers, quality] = await Promise.all([
        this.prisma.staffAction.findMany({
          where: {
            actor_id: h.user_id,
            kind: { in: [...REMOVAL_KINDS] },
            created_at: { gte: since(now, TURNOVER_DAYS) },
          },
          distinct: ['admin_id'],
          select: { admin_id: true },
        }),
        this.prisma.adminAppeal.findMany({
          where: {
            head_admin_id: h.user_id,
            owner_decision: { not: 'nothing' },
            created_at: {
              gte: since(now, n['staff.head.complaints_window_days']),
            },
          },
          distinct: ['author_id'],
          select: { author_id: true },
        }),
        ratingDate && team.length > 0
          ? this.prisma.staffRatingSnapshot.aggregate({
              where: {
                snapshot_date: ratingDate.snapshot_date,
                admin_id: { in: team.map((t) => t.user_id) },
                rating: { not: null },
              },
              _avg: { rating: true },
            })
          : Promise.resolve(null),
      ]);
      const turnoverPct = team.length
        ? (removed.length * 100) / team.length
        : 0;
      const turnoverScore = team.length
        ? Math.max(
            0,
            Math.round(
              100 - (turnoverPct * 100) / (2 * n['staff.head.turnover_pct']),
            ),
          )
        : null;
      const complaintsScore = Math.max(0, 100 - 50 * complainers.length);
      const teamQuality =
        quality?._avg.rating !== null && quality?._avg.rating !== undefined
          ? Math.round(quality._avg.rating)
          : null;
      const flags: string[] = [];
      const bigTurnover = turnoverExceeded({
        removed: removed.length,
        team: team.length,
        pct: n['staff.head.turnover_pct'],
        minPeople: n['staff.head.turnover_min_people'],
      });
      if (bigTurnover) flags.push('turnover_high');
      const manyComplaints = multiAppeals(
        complainers.length,
        n['staff.head.complaints_min'],
      );
      if (manyComplaints) flags.push('multi_appeals');
      const score = headScore([
        { value: teamQuality, weight: n['staff.head.weight_quality_pct'] },
        { value: turnoverScore, weight: n['staff.head.weight_turnover_pct'] },
        {
          value: complaintsScore,
          weight: n['staff.head.weight_complaints_pct'],
        },
      ]);
      const data = {
        team_quality: teamQuality,
        turnover_score: turnoverScore,
        complaints_score: complaintsScore,
        speed_score: null,
        score,
        flags,
      };
      await this.prisma.staffHeadSnapshot.upsert({
        where: {
          head_admin_id_snapshot_date: {
            head_admin_id: h.user_id,
            snapshot_date: day,
          },
        },
        create: { head_admin_id: h.user_id, snapshot_date: day, ...data },
        update: data,
      });
      if (bigTurnover) {
        const wrote = await emitSignal(this.prisma, {
          code: SIGNAL.turnover,
          subjectId: h.user_id,
          ref: `head:${h.user_id}`,
          dedupeDays: TURNOVER_DAYS,
          details: { removed: removed.length, team: team.length },
          now,
        });
        if (wrote) signals += 1;
      }
      if (manyComplaints) {
        const wrote = await emitSignal(this.prisma, {
          code: SIGNAL.multiAppeals,
          subjectId: h.user_id,
          ref: `head:${h.user_id}`,
          dedupeDays: 30,
          details: { authors: complainers.length },
          now,
        });
        if (wrote) signals += 1;
      }
    }
    return { heads: heads.length, signals };
  }
}
