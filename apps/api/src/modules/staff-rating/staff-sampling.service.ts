import { Inject, Injectable } from '@nestjs/common';
import type { AdminRole, Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { SAMPLE_QUEUE_KEY, type SamplePick } from './staff-recorder.service';

const DRAIN_BATCH = 500;
/** At most this many picks are turned into rows per run (the rest waits). */
const DRAIN_MAX = 50_000;
const GOLDEN_POOL = 200;
const DAY_MS = 86_400_000;

/** Which kinds of decision each admin role makes (work_leases.kind /
 * StaffDecisionEvent.itemKind): the golden pool of a role is its own kinds. */
export const ROLE_ITEM_KINDS: Readonly<Record<AdminRole, readonly string[]>> = {
  verifier: ['verification'],
  moderator: ['report', 'appeal'],
  support: ['support_ticket'],
  finance: [],
  super_admin: [],
};

export type SampleVerdict = 'same' | 'different' | 'worse';

/**
 * Staff package T5: second looks, AFTER the fact (never an approval step).
 *  - random re-check picks: 5% of decisions, 20% for a newcomer (first 14
 *    days), or a per-person override; the recorder queues the dice, this
 *    service turns the queue into staff_review_samples rows;
 *  - golden tasks: about 2% of a person's decisions come back as a task
 *    with a known answer (a decision a reviewer already confirmed), stored
 *    as `golden_<kind>` rows; the desk (T4/T9) serves them;
 *  - the verdict side: `completeSample` / `resolveGolden` close a row and
 *    write the quality signal the rating reads.
 */
@Injectable()
export class StaffSamplingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StaffSettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Turn the queued dice into review samples. Returns rows created. */
  async drainQueue(now: Date = new Date()): Promise<number> {
    const s = await this.settings.get();
    if (
      !s.switches['staff.rating_enabled'] ||
      !s.switches['staff.sampling_enabled']
    ) {
      return 0;
    }
    const base = s.numbers['staff.sampling.pct'];
    const newbie = s.numbers['staff.sampling.newcomer_pct'];
    const newbieDays = s.numbers['staff.sampling.newcomer_days'];
    let created = 0;
    let taken = 0;
    while (taken < DRAIN_MAX) {
      const raw = await this.redis.lpop(SAMPLE_QUEUE_KEY, DRAIN_BATCH);
      if (!raw || raw.length === 0) break;
      taken += raw.length;
      const picks = raw.flatMap((r) => {
        try {
          return [JSON.parse(r) as SamplePick];
        } catch {
          return [];
        }
      });
      const ids = [...new Set(picks.map((p) => p.a))];
      const [states, profiles] = await Promise.all([
        this.prisma.staffMemberState.findMany({
          where: { admin_id: { in: ids } },
          select: {
            admin_id: true,
            joined_queue_at: true,
            review_rate_override: true,
          },
        }),
        this.prisma.adminProfile.findMany({
          where: { user_id: { in: ids } },
          select: { user_id: true, created_at: true },
        }),
      ]);
      const state = new Map(states.map((x) => [x.admin_id, x]));
      const since = new Map(profiles.map((x) => [x.user_id, x.created_at]));
      const rows: Prisma.StaffReviewSampleCreateManyInput[] = [];
      for (const p of picks) {
        const st = state.get(p.a);
        const joined = st?.joined_queue_at ?? since.get(p.a) ?? null;
        const isNew =
          joined !== null &&
          now.getTime() - joined.getTime() < newbieDays * DAY_MS;
        const pct = st?.review_rate_override ?? (isNew ? newbie : base);
        if (p.u * 100 >= pct) continue;
        rows.push({
          decision_kind: p.k,
          item_id: p.i,
          decided_by: p.a,
          stage: isNew ? 'newcomer' : 'sample',
          golden_answer: { outcome: p.o },
        });
      }
      if (rows.length > 0) {
        const res = await this.prisma.staffReviewSample.createMany({
          data: rows,
          skipDuplicates: true,
        });
        created += res.count;
      }
      if (raw.length < DRAIN_BATCH) break;
    }
    return created;
  }

  /**
   * Golden tasks for yesterday: for each person about `staff.golden.pct` %
   * of their decisions, one task each, taken from the decisions a reviewer
   * already confirmed (verdict «same») in the person's own kinds. Returns
   * rows created.
   */
  async issueGolden(
    decidedByAdmin: ReadonlyMap<string, { decided: number; role: AdminRole }>,
    random: () => number = Math.random,
  ): Promise<number> {
    const s = await this.settings.get();
    if (
      !s.switches['staff.rating_enabled'] ||
      !s.switches['staff.golden_enabled']
    ) {
      return 0;
    }
    const pct = s.numbers['staff.golden.pct'];
    const pools = new Map<
      string,
      Array<{
        item_id: string;
        decided_by: string;
        golden_answer: Prisma.JsonValue;
      }>
    >();
    const kinds = new Set<string>();
    for (const { role } of decidedByAdmin.values()) {
      for (const k of ROLE_ITEM_KINDS[role]) kinds.add(k);
    }
    for (const kind of kinds) {
      pools.set(
        kind,
        await this.prisma.staffReviewSample.findMany({
          where: {
            decision_kind: kind,
            status: 'done',
            verdict: 'same',
            is_golden: false,
          },
          orderBy: { done_at: 'desc' },
          take: GOLDEN_POOL,
          select: { item_id: true, decided_by: true, golden_answer: true },
        }),
      );
    }
    const data: Prisma.StaffReviewSampleCreateManyInput[] = [];
    for (const [adminId, { decided, role }] of decidedByAdmin) {
      const own = ROLE_ITEM_KINDS[role];
      if (own.length === 0) continue;
      const expected = (decided * pct) / 100;
      const n = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
      for (let t = 0; t < n; t++) {
        const kind = own[Math.floor(random() * own.length)];
        const pool = (pools.get(kind) ?? []).filter(
          (x) => x.decided_by !== adminId,
        );
        if (pool.length === 0) continue;
        const pick = pool[Math.floor(random() * pool.length)];
        data.push({
          decision_kind: `golden_${kind}`,
          item_id: pick.item_id,
          decided_by: adminId,
          is_golden: true,
          stage: 'golden',
          golden_answer: pick.golden_answer as Prisma.InputJsonValue,
        });
      }
    }
    if (data.length === 0) return 0;
    const res = await this.prisma.staffReviewSample.createMany({
      data,
      skipDuplicates: true,
    });
    return res.count;
  }

  /** A reviewer's verdict on a random sample (T8/T9 UI calls this).
   * `different`/`worse` is a quality signal against the person whose
   * decision was checked. Only a pending, non-golden row can be completed. */
  async completeSample(
    sampleId: string,
    reviewerId: string,
    verdict: SampleVerdict,
  ): Promise<boolean> {
    const row = await this.prisma.staffReviewSample.findUnique({
      where: { id: sampleId },
    });
    if (!row || row.status !== 'pending' || row.is_golden) return false;
    if (row.decided_by === reviewerId) return false;
    const done = await this.prisma.staffReviewSample.updateMany({
      where: { id: sampleId, status: 'pending' },
      data: {
        status: 'done',
        verdict,
        reviewer_id: reviewerId,
        done_at: new Date(),
      },
    });
    if (done.count === 0) return false;
    if (verdict !== 'same') {
      await this.prisma.staffQualitySignal.create({
        data: {
          admin_id: row.decided_by,
          kind: 'sample_diff',
          item_kind: row.decision_kind.slice(0, 24),
          item_id: row.item_id,
        },
      });
    }
    return true;
  }

  /** The worker answered a golden task: compare with the known answer. */
  async resolveGolden(sampleId: string, outcome: string): Promise<boolean> {
    const row = await this.prisma.staffReviewSample.findUnique({
      where: { id: sampleId },
    });
    if (!row || !row.is_golden || row.status !== 'pending') return false;
    const known = (row.golden_answer as { outcome?: string } | null)?.outcome;
    const pass = known !== undefined && known === outcome;
    const done = await this.prisma.staffReviewSample.updateMany({
      where: { id: sampleId, status: 'pending' },
      data: {
        status: 'done',
        verdict: pass ? 'same' : 'different',
        done_at: new Date(),
      },
    });
    if (done.count === 0) return false;
    await this.prisma.staffQualitySignal.create({
      data: {
        admin_id: row.decided_by,
        kind: pass ? 'golden_pass' : 'golden_fail',
        item_kind: row.decision_kind.slice(0, 24),
        item_id: row.item_id,
      },
    });
    return pass;
  }
}
