import { Injectable, Logger } from '@nestjs/common';
import type { AdminWorkspace } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  RetaliationAction,
  RetaliationCheck,
  RetaliationPort,
} from '../staff-core/retaliation.port';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import {
  holdUntil,
  insideWindow,
  isTopRated,
  multiAppeals,
  REMOVAL_ACTIONS,
  REMOVAL_KINDS,
  SIGNAL,
  since,
  turnoverExceeded,
  windowUntil,
} from './staff-appeals.logic';
import { emitSignal } from './staff-signals';

const BATCH = 500;
const TURNOVER_LOOKBACK_DAYS = 30;
const NO_WARNING_LOOKBACK_DAYS = 60;

export interface ExpireResult {
  holdsEnded: number;
  flagsCleared: number;
  reminders: number;
}

/**
 * Staff package T6 (plan B3, research 3.2 item 4): the retaliation guard.
 * Binds RETALIATION_PORT. When someone who is not the owner (a head) pulls,
 * replaces, offboards or sharply cuts the rights of a person who wrote an
 * appeal inside the window (90 days), the action is NOT blocked and there
 * is no second approver, but
 *   - a `staff_retaliation_flags` row is written (the owner's red mark),
 *   - the person goes to `hold_owner` for 14 days (reversible by the owner
 *     only; the caller must not overwrite that state when `flagged`),
 *   - a `staff_actions` row records the hold (legal journal).
 * Next to it run the automatic guards (more than 15 % of a team removed in
 * 30 days, a top-rated person removed, removal without a warning, two
 * complaints from different people in 60 days): each writes an owner-inbox
 * signal, never a block. Best effort: an error is logged, the action goes on.
 * All thresholds come from the staff settings.
 */
@Injectable()
export class StaffRetaliationService implements RetaliationPort {
  private readonly logger = new Logger(StaffRetaliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
  ) {}

  async check(
    subjectAdminId: string,
    actorAdminId: string,
    action: RetaliationAction,
    actionId?: string,
  ): Promise<RetaliationCheck> {
    if (!(await this.staff.isOn('staff.appeals_enabled'))) {
      return { flagged: false };
    }
    try {
      return await this.run(
        subjectAdminId,
        actorAdminId,
        action,
        actionId,
        new Date(),
      );
    } catch (e) {
      this.logger.error(`retaliation check failed: ${String(e)}`);
      return { flagged: false };
    }
  }

  private async run(
    subjectId: string,
    actorId: string,
    action: RetaliationAction,
    actionId: string | undefined,
    now: Date,
  ): Promise<RetaliationCheck> {
    if (subjectId === actorId) return { flagged: false };
    const { numbers: n } = await this.staff.get();
    const profiles = await this.prisma.adminProfile.findMany({
      where: { user_id: { in: [subjectId, actorId] } },
      select: { user_id: true, admin_role: true, workspace: true },
    });
    const actor = profiles.find((p) => p.user_id === actorId);
    const subject = profiles.find((p) => p.user_id === subjectId);
    // The owner acts on their own account: nothing to guard.
    if (!actor || actor.admin_role === 'super_admin') return { flagged: false };

    const removal = (REMOVAL_ACTIONS as readonly string[]).includes(action);
    const flagged = await this.guardRetaliation(
      subjectId,
      actorId,
      action,
      actionId,
      now,
      n['staff.retaliation.window_days'],
      n['staff.retaliation.hold_days'],
    );
    if (removal && subject) {
      await this.guardRemoval(subjectId, actorId, subject.workspace, now, n);
    }
    return { flagged };
  }

  private async guardRetaliation(
    subjectId: string,
    actorId: string,
    action: RetaliationAction,
    actionId: string | undefined,
    now: Date,
    windowDays: number,
    holdDays: number,
  ): Promise<boolean> {
    const appeal = await this.prisma.adminAppeal.findFirst({
      where: {
        author_id: subjectId,
        created_at: { gt: since(now, windowDays) },
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, created_at: true, head_admin_id: true },
    });
    if (!appeal || !insideWindow(appeal.created_at, now, windowDays)) {
      return false;
    }
    const open = await this.prisma.staffRetaliationFlag.findFirst({
      where: {
        subject_admin_id: subjectId,
        state: 'open',
        hold_until: { gt: now },
      },
      select: { id: true },
    });
    if (open) return true;
    const until = holdUntil(now, holdDays);
    await this.prisma.$transaction([
      this.prisma.staffRetaliationFlag.create({
        data: {
          appeal_id: appeal.id,
          subject_admin_id: subjectId,
          action_id: actionId ?? null,
          window_until: windowUntil(appeal.created_at, windowDays),
          hold_until: until,
        },
      }),
      this.prisma.staffMemberState.upsert({
        where: { admin_id: subjectId },
        create: {
          admin_id: subjectId,
          state: 'hold_owner',
          state_reason: 'retaliation_check',
          state_until: until,
        },
        update: {
          state: 'hold_owner',
          state_reason: 'retaliation_check',
          state_until: until,
        },
      }),
      this.prisma.staffAction.create({
        data: {
          admin_id: subjectId,
          actor_id: actorId,
          source: 'system',
          kind: 'hold_owner',
          reason_code: 'retaliation_check',
          reason_note: `${action} within ${windowDays} days of an appeal`,
          ends_at: until,
          created_at: now,
        },
      }),
    ]);
    return true;
  }

  /** The automatic guards of a removal: signals for the owner, no block. */
  private async guardRemoval(
    subjectId: string,
    actorId: string,
    workspace: AdminWorkspace,
    now: Date,
    n: Record<string, number>,
  ): Promise<void> {
    const complaintsDays = n['staff.head.complaints_window_days'];
    const [team, removedBefore, snapshot, warned, complainers] =
      await Promise.all([
        this.prisma.adminProfile.count({
          where: {
            workspace,
            is_workspace_head: false,
            admin_role: { not: 'super_admin' },
          },
        }),
        this.prisma.staffAction.findMany({
          where: {
            actor_id: actorId,
            kind: { in: [...REMOVAL_KINDS] },
            admin_id: { not: subjectId },
            created_at: { gte: since(now, TURNOVER_LOOKBACK_DAYS) },
          },
          distinct: ['admin_id'],
          select: { admin_id: true },
        }),
        this.prisma.staffRatingSnapshot.findFirst({
          where: { admin_id: subjectId, rating: { not: null } },
          orderBy: { snapshot_date: 'desc' },
          select: { rating: true, rank_pct: true },
        }),
        this.prisma.staffAction.findFirst({
          where: {
            admin_id: subjectId,
            kind: 'warn',
            created_at: { gte: since(now, NO_WARNING_LOOKBACK_DAYS) },
          },
          select: { id: true },
        }),
        this.prisma.adminAppeal.findMany({
          where: {
            head_admin_id: actorId,
            created_at: { gte: since(now, complaintsDays) },
          },
          distinct: ['author_id'],
          select: { author_id: true },
        }),
      ]);
    const day = now.toISOString().slice(0, 10);
    const removed = removedBefore.length + 1;

    if (
      turnoverExceeded({
        removed,
        team,
        pct: n['staff.head.turnover_pct'],
        minPeople: n['staff.head.turnover_min_people'],
      })
    ) {
      await emitSignal(this.prisma, {
        code: SIGNAL.turnover,
        subjectId: actorId,
        ref: `head:${actorId}`,
        dedupeDays: TURNOVER_LOOKBACK_DAYS,
        details: { removed, team, days: TURNOVER_LOOKBACK_DAYS },
        now,
      });
    }
    if (
      snapshot &&
      isTopRated({
        rating: snapshot.rating,
        rankPct: snapshot.rank_pct,
        topRating: n['staff.head.top_rating'],
        topPct: n['staff.head.top_pct'],
      })
    ) {
      await emitSignal(this.prisma, {
        code: SIGNAL.topRated,
        subjectId,
        actorId,
        ref: `removal:${subjectId}:${day}`,
        dedupeDays: 1,
        details: { rating: snapshot.rating, rankPct: snapshot.rank_pct },
        now,
      });
    }
    if (!warned) {
      await emitSignal(this.prisma, {
        code: SIGNAL.noWarning,
        subjectId,
        actorId,
        ref: `removal:${subjectId}:${day}`,
        dedupeDays: 1,
        details: { lookbackDays: NO_WARNING_LOOKBACK_DAYS },
        now,
      });
    }
    if (multiAppeals(complainers.length, n['staff.head.complaints_min'])) {
      await emitSignal(this.prisma, {
        code: SIGNAL.multiAppeals,
        subjectId: actorId,
        ref: `head:${actorId}`,
        dedupeDays: 30,
        details: { authors: complainers.length, days: complaintsDays },
        now,
      });
    }
  }

  /**
   * Job `staff.retaliation-expire`. (1) A hold that ran out: the person
   * leaves `hold_owner` (the head's removal takes effect; a rights cut
   * returns to work) and the owner is asked to decide (signal). (2) A flag
   * whose protection window is over and which sat a day after its hold is
   * closed. (3) An appeal nobody opened for `staff.retaliation.ack_days`
   * days reminds the owner. Batches of 500, idempotent.
   */
  async expire(now = new Date()): Promise<ExpireResult> {
    const ackDays = await this.staff.number('staff.retaliation.ack_days');
    const ended = await this.prisma.staffRetaliationFlag.findMany({
      where: { state: 'open', hold_until: { lte: now } },
      orderBy: { hold_until: 'asc' },
      take: BATCH,
      select: {
        id: true,
        subject_admin_id: true,
        action_id: true,
        appeal_id: true,
      },
    });
    let holdsEnded = 0;
    if (ended.length > 0) {
      const actionIds = ended.flatMap((f) =>
        f.action_id ? [f.action_id] : [],
      );
      const actions = actionIds.length
        ? await this.prisma.staffAction.findMany({
            where: { id: { in: actionIds } },
            select: { id: true, kind: true },
          })
        : [];
      const kindOf = new Map(actions.map((a) => [a.id, a.kind]));
      // The «decide» signal is about the HEAD, never the person: that
      // person may be an anonymous author.
      const appeals = await this.prisma.adminAppeal.findMany({
        where: { id: { in: ended.map((f) => f.appeal_id) } },
        select: { id: true, head_admin_id: true },
      });
      const headOf = new Map(appeals.map((a) => [a.id, a.head_admin_id]));
      for (const f of ended) {
        const kind = f.action_id ? kindOf.get(f.action_id) : undefined;
        const removal = kind === undefined || REMOVAL_KINDS.includes(kind);
        const moved = await this.prisma.staffMemberState.updateMany({
          where: { admin_id: f.subject_admin_id, state: 'hold_owner' },
          data: {
            state: removal ? 'offboarded' : 'active',
            state_reason: 'retaliation_hold_expired',
            state_until: null,
          },
        });
        holdsEnded += moved.count;
        const head = headOf.get(f.appeal_id);
        if (!head) continue;
        await emitSignal(this.prisma, {
          code: SIGNAL.holdExpired,
          subjectId: head,
          ref: `flag:${f.id}`,
          dedupeDays: 120,
          details: { flagId: f.id },
          now,
        });
      }
    }

    const cleared = await this.prisma.staffRetaliationFlag.updateMany({
      where: {
        state: 'open',
        window_until: { lte: now },
        hold_until: { lte: since(now, 1) },
      },
      data: { state: 'cleared', decided_at: now },
    });

    const stale = await this.prisma.adminAppeal.findMany({
      where: { status: 'new', created_at: { lte: since(now, ackDays) } },
      orderBy: { created_at: 'asc' },
      take: BATCH,
      select: { id: true, head_admin_id: true, author_alias: true },
    });
    let reminders = 0;
    for (const a of stale) {
      const wrote = await emitSignal(this.prisma, {
        code: SIGNAL.appealUnanswered,
        subjectId: a.head_admin_id,
        ref: `appeal:${a.id}`,
        dedupeDays: ackDays,
        details: { appealNumber: a.author_alias, days: ackDays },
        now,
      });
      if (wrote) reminders += 1;
    }
    return { holdsEnded, flagsCleared: cleared.count, reminders };
  }
}
