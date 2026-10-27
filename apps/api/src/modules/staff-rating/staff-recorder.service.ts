import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { pipeline } from '../../redis/redis-cluster-safe';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type {
  StaffDecisionEvent,
  StaffRecorder,
} from '../staff-core/staff-recorder.port';
import type {
  StaffSignalKind,
  StaffSignals,
} from '../staff-core/staff-signals.port';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffCountersService } from './staff-counters.service';

/** Sampling picks wait here until the nightly job turns them into rows. */
export const SAMPLE_QUEUE_KEY = 'staff:smp:q';
/** The queue is capped, so a stopped job cannot fill Redis. */
const SAMPLE_QUEUE_MAX = 200_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SamplePick {
  /** decided_by */
  a: string;
  /** item kind */
  k: string;
  /** item id */
  i: string;
  /** the dice, 0-1: the nightly job keeps the pick when u*100 < the
   * person's percent (newcomers have a higher one). */
  u: number;
  /** the decision's outcome word. */
  o: string;
}

/**
 * Staff package T5: the real StaffRecorder (and the quality-signal side).
 *  - `record()` — the decision of an admin: ONE Redis pipeline (counters),
 *    plus one list push for the few decisions picked for a second look. No
 *    database query on the hot path. Off (`staff.rating_enabled` false, the
 *    default) it returns at once.
 *  - `signal()` — something happened AFTER the close (complaint, appeal,
 *    repeat ticket, thumb): one row in staff_quality_signals.
 * Both are best effort: they swallow their own errors, so a Redis or
 * database hiccup can never fail the admin's request.
 */
@Injectable()
export class StaffRecorderService implements StaffRecorder, StaffSignals {
  private readonly log = new Logger(StaffRecorderService.name);

  constructor(
    private readonly settings: StaffSettingsService,
    private readonly counters: StaffCountersService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async record(event: StaffDecisionEvent): Promise<void> {
    try {
      const s = await this.settings.get();
      if (!s.switches['staff.rating_enabled']) return;
      if (!UUID_RE.test(event.adminId)) return;
      const fresh = await this.counters.bump(event);
      if (!fresh || !s.switches['staff.sampling_enabled']) return;
      const top = Math.max(
        s.numbers['staff.sampling.pct'],
        s.numbers['staff.sampling.newcomer_pct'],
      );
      const u = Math.random();
      if (u * 100 >= top) return;
      const pick: SamplePick = {
        a: event.adminId,
        k: event.itemKind.slice(0, 24),
        i: event.itemId,
        u: Math.round(u * 1e6) / 1e6,
        o: event.outcome.slice(0, 16),
      };
      const p = pipeline(this.redis);
      p.rpush(SAMPLE_QUEUE_KEY, JSON.stringify(pick));
      p.ltrim(SAMPLE_QUEUE_KEY, -SAMPLE_QUEUE_MAX, -1);
      await p.exec();
    } catch (e) {
      this.log.warn(`staff record failed: ${(e as Error).message}`);
    }
  }

  async signal(
    adminId: string,
    kind: StaffSignalKind,
    itemKind: string,
    itemId: string,
  ): Promise<void> {
    try {
      if (!(await this.settings.isOn('staff.rating_enabled'))) return;
      if (!UUID_RE.test(adminId) || !UUID_RE.test(itemId)) return;
      await this.prisma.staffQualitySignal.create({
        data: {
          admin_id: adminId,
          kind,
          item_kind: itemKind.slice(0, 24),
          item_id: itemId,
        },
      });
    } catch (e) {
      this.log.warn(`staff signal failed: ${(e as Error).message}`);
    }
  }

  async signalForModerationAction(
    actionId: string,
    kind: StaffSignalKind,
    itemKind: string,
    itemId: string,
  ): Promise<void> {
    try {
      if (!(await this.settings.isOn('staff.rating_enabled'))) return;
      const action = await this.prisma.moderationAction.findUnique({
        where: { id: actionId },
        select: { admin_id: true },
      });
      if (action) await this.signal(action.admin_id, kind, itemKind, itemId);
    } catch (e) {
      this.log.warn(`staff signal failed: ${(e as Error).message}`);
    }
  }
}
