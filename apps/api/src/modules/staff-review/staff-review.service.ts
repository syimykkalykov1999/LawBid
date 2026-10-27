import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type AdminRole } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import {
  STAFF_SIGNALS,
  type StaffSignals,
} from '../staff-core/staff-signals.port';
import {
  ROLE_ITEM_KINDS,
  StaffSamplingService,
} from '../staff-rating/staff-sampling.service';
import { registerLeaseSource } from '../work-lease/lease-queue-sources';
import { LeaseService } from '../work-lease/lease.service';
import type {
  ReviewCurrentDto,
  ReviewFactDto,
  ReviewGoldenBodyDto,
  ReviewGoldenIssuedDto,
  ReviewNextDto,
  ReviewSampleDto,
  ReviewVerdictBodyDto,
  ReviewVerdictResultDto,
} from './staff-review.dto';
import {
  baseKind,
  PEER_DONE,
  PEER_PREFIX,
  REVIEW_LEASE_KIND,
  toSampleVerdict,
} from './staff-review.constants';
import {
  reviewNotFound,
  type ReviewAccess,
} from './staff-review-access.service';
import { reviewSampleSource } from './review-sample.lease-source';

const FACT_MAX = 300;

const gone = () =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'This sample is no longer in your hands.',
  });

const clip = (v: string | number): string => String(v).slice(0, FACT_MAX);
const iso = (d: Date | null | undefined): string => (d ? d.toISOString() : '');

/**
 * Staff package T9: the re-check loop, reviewer side. A pending sample
 * (T5: 5% of decisions, 20% for newcomers, AI disagreements, and the peer
 * copies made here) is LEASED to one reviewer through the lease engine
 * (kind `review_sample`), shown read-only, and closed with a verdict:
 *  - confirmed → T5 `completeSample(same)`: no signal, the decision stands;
 *  - overturned → `completeSample(different|worse)`: a `sample_diff` signal
 *    against the worker (the rating, and the pay: overturned items are not
 *    paid), and for a harmful one also an `overturned` signal (the red
 *    «three in a week» flag);
 *  - unclear → no mark at all; the sample goes to another reviewer.
 * After the fact, never an approval step: the worker's decision is already
 * in force. A small share of finished verdicts is queued again for a second
 * reviewer (`staff.peer_check.pct`, a `cal_<kind>` copy) — the calibration
 * of reviewers among themselves; that copy never touches the worker.
 * Every verdict writes an audit row. Reviewers never see who decided
 * (only the owner does).
 */
@Injectable()
export class StaffReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StaffSettingsService,
    private readonly leases: LeaseService,
    private readonly sampling: StaffSamplingService,
    private readonly audit: AuditLogService,
    @Optional() @Inject(STAFF_SIGNALS) private readonly signals?: StaffSignals,
  ) {
    registerLeaseSource(reviewSampleSource);
  }

  // --- the queue -------------------------------------------------------------

  /** «Следующий» of the re-check: one sample, one reviewer. */
  async next(admin: AdminActor, a: ReviewAccess): Promise<ReviewNextDto> {
    // Nothing is ever leased while the lease engine itself is off.
    if (!(await this.settings.isOn('staff.lease_enabled'))) {
      return { status: 'off', sample: null };
    }
    const r = await this.leases.next(REVIEW_LEASE_KIND, {
      adminId: admin.id,
      countries: null,
    });
    if (r.status === 'leased') {
      const sample = await this.present(r.lease.itemId, r.lease.leasedUntil, a);
      return { status: sample ? 'leased' : 'empty', sample };
    }
    if (r.status === 'busy') {
      const mine = r.held.find((h) => h.kind === REVIEW_LEASE_KIND);
      const sample = mine
        ? await this.present(mine.itemId, mine.leasedUntil, a)
        : null;
      return { status: sample ? 'leased' : 'busy', sample };
    }
    return { status: r.status, sample: null };
  }

  /** The sample I hold now (after a page reload). */
  async current(admin: AdminActor, a: ReviewAccess): Promise<ReviewCurrentDto> {
    const mine = (await this.leases.mine(admin.id)).find(
      (l) => l.kind === REVIEW_LEASE_KIND && l.leasedUntil > new Date(),
    );
    return {
      sample: mine
        ? await this.present(mine.itemId, mine.leasedUntil, a)
        : null,
    };
  }

  /** Let go without a verdict (the sample goes back to the queue). */
  async release(admin: AdminActor, sampleId: string): Promise<boolean> {
    return this.leases.release(REVIEW_LEASE_KIND, sampleId, admin.id);
  }

  // --- the verdict --------------------------------------------------------------

  async verdict(
    admin: AdminActor,
    sampleId: string,
    dto: ReviewVerdictBodyDto,
  ): Promise<ReviewVerdictResultDto> {
    const reasons = [...new Set(dto.reasons ?? [])];
    if (dto.verdict === 'overturned' && reasons.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Name at least one reason when overturning a decision.',
      });
    }
    const row = await this.prisma.staffReviewSample.findUnique({
      where: { id: sampleId },
    });
    if (!row || row.status !== 'pending' || row.is_golden) throw gone();
    const held = await this.prisma.workLease.findFirst({
      where: {
        kind: REVIEW_LEASE_KIND,
        item_id: sampleId,
        admin_id: admin.id,
        leased_until: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!held) throw gone();
    const peer = row.decision_kind.startsWith(PEER_PREFIX);
    const audit = {
      adminId: admin.id,
      action: 'staff.review_verdict',
      targetType: 'staff_review_sample',
      targetId: sampleId,
      ip: admin.ip,
    };

    if (dto.verdict === 'unclear') {
      // Cannot tell: no mark for anybody; another reviewer gets it.
      const skipped = await this.leases.skip(
        REVIEW_LEASE_KIND,
        sampleId,
        admin.id,
        'unclear',
      );
      if (!skipped.ok)
        await this.leases.release(REVIEW_LEASE_KIND, sampleId, admin.id);
      await this.audit.record({
        ...audit,
        after: {
          verdict: 'unclear',
          decisionKind: row.decision_kind,
          peer,
          ...(dto.note ? { note: dto.note } : {}),
        },
      });
      return { ok: true, result: 'returned' };
    }

    const sv = toSampleVerdict(dto.verdict, reasons);
    const ok = peer
      ? await this.completePeer(sampleId, admin.id, sv)
      : await this.sampling.completeSample(sampleId, admin.id, sv);
    if (!ok) throw gone();
    if (!peer && sv === 'worse') {
      // A harmful mistake also counts toward the red «overturned in a week» flag.
      await this.signals?.signal(
        row.decided_by,
        'overturned',
        row.decision_kind,
        row.item_id,
      );
    }
    await this.audit.record({
      ...audit,
      after: {
        verdict: dto.verdict,
        stored: sv,
        reasons,
        decisionKind: row.decision_kind,
        decidedBy: row.decided_by,
        peer,
        ...(dto.note ? { note: dto.note } : {}),
      },
    });
    await this.leases.done(REVIEW_LEASE_KIND, sampleId, admin.id);
    if (!peer) await this.maybeQueuePeer(row, admin.id, sv);
    return { ok: true, result: 'done' };
  }

  /** A peer (calibration) copy: the verdict is stored, no signal anywhere. */
  private async completePeer(
    sampleId: string,
    reviewerId: string,
    verdict: string,
  ): Promise<boolean> {
    const res = await this.prisma.staffReviewSample.updateMany({
      where: { id: sampleId, status: 'pending', reviewer_id: null },
      data: {
        status: PEER_DONE,
        verdict,
        reviewer_id: reviewerId,
        done_at: new Date(),
      },
    });
    return res.count > 0;
  }

  /** `staff.peer_check.pct` % of finished verdicts get a second, blind look. */
  private async maybeQueuePeer(
    row: {
      id: string;
      decision_kind: string;
      item_id: string;
      golden_answer: Prisma.JsonValue;
    },
    reviewerId: string,
    verdict: string,
    dice: () => number = Math.random,
  ): Promise<boolean> {
    const s = await this.settings.get();
    if (!s.switches['staff.peer_check_enabled']) return false;
    if (dice() * 100 >= s.numbers['staff.peer_check.pct']) return false;
    const outcome = (row.golden_answer as { outcome?: string } | null)?.outcome;
    const res = await this.prisma.staffReviewSample.createMany({
      data: [
        {
          decision_kind: `${PEER_PREFIX}${row.decision_kind}`.slice(0, 24),
          item_id: row.item_id,
          // The one whose work is checked is the FIRST REVIEWER (never the
          // worker): the copy is kept apart from the worker's counters.
          decided_by: reviewerId,
          stage: 'peer',
          golden_answer: {
            outcome: outcome ?? null,
            origReviewer: reviewerId,
            origVerdict: verdict,
            origSample: row.id,
          },
        },
      ],
      skipDuplicates: true,
    });
    return res.count > 0;
  }

  // --- golden tasks (owner, head) ------------------------------------------------

  /**
   * A confirmed decision becomes a golden task for one worker: a task with a
   * known answer that comes back in the worker's own queue (T4 serves it,
   * T5 `resolveGolden` scores it). The head picks within their workspace.
   */
  async markGolden(
    admin: AdminActor,
    a: ReviewAccess,
    dto: ReviewGoldenBodyDto,
    random: () => number = Math.random,
  ): Promise<ReviewGoldenIssuedDto> {
    if (!(await this.settings.isOn('staff.golden_enabled'))) {
      throw reviewNotFound();
    }
    const src = await this.prisma.staffReviewSample.findUnique({
      where: { id: dto.sampleId },
    });
    if (
      !src ||
      src.status !== 'done' ||
      src.verdict !== 'same' ||
      src.is_golden ||
      src.decision_kind.startsWith(PEER_PREFIX)
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Only a decision a reviewer confirmed can become golden.',
      });
    }
    const owner = await this.prisma.adminProfile.findUnique({
      where: { user_id: src.decided_by },
      select: { workspace: true },
    });
    if (!owner || (a.workspace !== null && owner.workspace !== a.workspace)) {
      throw reviewNotFound();
    }
    const workspace = a.workspace ?? owner.workspace;
    const roles = (
      Object.entries(ROLE_ITEM_KINDS) as Array<[AdminRole, readonly string[]]>
    )
      .filter(([, kinds]) => kinds.includes(src.decision_kind))
      .map(([role]) => role);
    const people = await this.prisma.adminProfile.findMany({
      where: {
        workspace,
        admin_role: { in: roles },
        user_id: { not: src.decided_by },
        ...(dto.workerId ? { user_id: dto.workerId } : {}),
      },
      select: { user_id: true },
      take: 500,
    });
    const ids = people
      .map((p) => p.user_id)
      .filter((id) => id !== src.decided_by);
    const states = ids.length
      ? await this.prisma.staffMemberState.findMany({
          where: { admin_id: { in: ids }, state: { not: 'active' } },
          select: { admin_id: true },
        })
      : [];
    const out = new Set(states.map((x) => x.admin_id));
    const eligible = ids.filter((id) => !out.has(id));
    if (eligible.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'No worker of this workspace can take this kind of task.',
      });
    }
    const worker = dto.workerId
      ? eligible[0]
      : eligible[Math.floor(random() * eligible.length)];
    let goldenId: string;
    try {
      const created = await this.prisma.staffReviewSample.create({
        data: {
          decision_kind: `golden_${src.decision_kind}`.slice(0, 24),
          item_id: src.item_id,
          decided_by: worker,
          is_golden: true,
          stage: 'golden',
          golden_answer: src.golden_answer as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      goldenId = created.id;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'This decision is already a golden task.',
        });
      }
      throw e;
    }
    await this.audit.record({
      adminId: admin.id,
      action: 'staff.golden_marked',
      targetType: 'staff_review_sample',
      targetId: goldenId,
      after: { source: src.id, worker, decisionKind: src.decision_kind },
      ip: admin.ip,
    });
    return { ok: true, goldenId };
  }

  // --- what the reviewer sees ------------------------------------------------------

  private async present(
    sampleId: string,
    leasedUntil: Date,
    a: ReviewAccess,
  ): Promise<ReviewSampleDto | null> {
    const row = await this.prisma.staffReviewSample.findUnique({
      where: { id: sampleId },
    });
    if (!row || row.status !== 'pending' || row.is_golden) return null;
    const kind = baseKind(row.decision_kind);
    const [facts, done, who] = await Promise.all([
      this.facts(kind, row.item_id),
      this.prisma.workLeaseEvent.findFirst({
        where: { kind, item_id: row.item_id, event: 'done' },
        orderBy: { created_at: 'desc' },
        select: { created_at: true, held_ms: true },
      }),
      a.level === 'owner'
        ? this.prisma.user.findUnique({
            where: { id: row.decided_by },
            select: { first_name: true, last_name: true },
          })
        : Promise.resolve(null),
    ]);
    const outcome = (row.golden_answer as { outcome?: string | null } | null)
      ?.outcome;
    return {
      id: row.id,
      decisionKind: kind,
      itemId: row.item_id,
      stage: row.stage,
      outcome: outcome ?? null,
      decidedAt: done ? done.created_at.toISOString() : null,
      handleSec: done?.held_ms != null ? Math.round(done.held_ms / 1000) : null,
      facts,
      leasedUntil: leasedUntil.toISOString(),
      // Anonymity: only the owner learns who decided (never for a peer copy,
      // where the row's «decided_by» is the first reviewer).
      worker:
        a.level === 'owner' && !row.decision_kind.startsWith(PEER_PREFIX)
          ? {
              adminId: row.decided_by,
              name:
                [who?.first_name, who?.last_name].filter(Boolean).join(' ') ||
                'Admin',
            }
          : null,
    };
  }

  /**
   * Read-only facts of the checked item, a few fields each; never a private
   * chat or a file. The admin response mask (T11) still applies on top.
   */
  private async facts(kind: string, itemId: string): Promise<ReviewFactDto[]> {
    const f: ReviewFactDto[] = [];
    const add = (key: string, v: string | number | Date | null | undefined) => {
      if (v !== null && v !== undefined && v !== '') {
        f.push({ key, value: v instanceof Date ? iso(v) : clip(v) });
      }
    };
    if (kind === 'verification') {
      const r = await this.prisma.verificationRequest.findUnique({
        where: { id: itemId },
        select: {
          status: true,
          submitted_at: true,
          reviewed_at: true,
          rejection_code: true,
          rejection_reason: true,
          admin_note: true,
        },
      });
      if (r) {
        add('status', r.status);
        add('submittedAt', r.submitted_at);
        add('reviewedAt', r.reviewed_at);
        add('rejectionCode', r.rejection_code);
        add('rejectionReason', r.rejection_reason);
        add('adminNote', r.admin_note);
      }
    } else if (kind === 'support_ticket') {
      const t = await this.prisma.supportTicket.findUnique({
        where: { id: itemId },
        select: {
          subject: true,
          category: true,
          status: true,
          created_at: true,
          resolved_at: true,
        },
      });
      if (t) {
        add('subject', t.subject);
        add('category', t.category);
        add('status', t.status);
        add('createdAt', t.created_at);
        add('resolvedAt', t.resolved_at);
      }
    } else if (kind === 'report') {
      const rows = await this.prisma.report.findMany({
        where: { target_id: itemId },
        orderBy: { created_at: 'asc' },
        take: 5,
        select: {
          target_type: true,
          reason: true,
          note: true,
          status: true,
          handled_at: true,
        },
      });
      for (const [i, r] of rows.entries()) {
        if (i === 0) add('targetType', r.target_type);
        add('reason', r.reason);
        add('note', r.note);
        if (i === 0) add('status', r.status);
        if (i === 0) add('handledAt', r.handled_at);
      }
    } else if (kind === 'appeal' || kind === 'mod_appeal') {
      const ap = await this.prisma.moderationAppeal.findUnique({
        where: { id: itemId },
        select: {
          target_type: true,
          message: true,
          status: true,
          decision_note: true,
          decided_at: true,
        },
      });
      if (ap) {
        add('targetType', ap.target_type);
        add('message', ap.message);
        add('status', ap.status);
        add('decisionNote', ap.decision_note);
        add('decidedAt', ap.decided_at);
      }
    }
    return f;
  }
}
