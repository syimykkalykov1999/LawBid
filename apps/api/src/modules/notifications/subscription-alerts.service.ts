import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from '@nestjs/common';
import { demoContext } from '../../common/demo/demo-context';
import { CaseFanoutService } from './case-fanout/case-fanout.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { DbTx } from '../../prisma/secret-columns';
import { withTxRetry } from '../../prisma/tx-retry.util';
import {
  CrossFamilyOutbox,
  type OutboxTicket,
} from '../../sharding/outbox/cross-family-outbox';
import { registerAfterCommitEffect } from '../../sharding/outbox/outbox-effects';
import {
  shardCarry,
  shardContext,
  shardKeyOf,
} from '../../sharding/shard-context';
import { readsAreSplit } from '../../sharding/split-reads';
import { NotificationsService } from './notifications.service';

/** X1: the outbox event of a recorded new-case alert round. */
export const CASE_ALERTS_EVENT = 'case.alerts.start';

export interface CaseAlertsPayload {
  caseId: string;
  /** `start`: the round of the current generation (publish, re-alert);
   * `urgent_top_up`: the extra round of a case that became urgent. */
  mode: 'start' | 'urgent_top_up';
  /** The case's shard context (`case:<uuid>`), restored by the relay. */
  shardKey?: string;
}

export interface CaseAlertsTicket {
  readonly caseId: string;
  readonly mode: CaseAlertsPayload['mode'];
  readonly ticket: OutboxTicket | null;
}

/** One post alerts at most this many people (a later stage can
 * fan out through a queue). Audit A-1: raised from 5000 now that the
 * audience is read by keyset and written in batches. */
export const ALERT_FANOUT_MAX = 100_000;
/** Recipients per INSERT / push enqueue. */
export const ALERT_BATCH = 500;

/**
 * Owner 2026-09-30, opt-in alerts (categories off by default):
 * - `following`: a person I follow published a post or news;
 * - `new_cases` (attorneys): a new case in my practices and in a state
 *   where I hold a verified license.
 * Only people who turned the category on get a row and a push; blocks
 * either way are skipped. Fire-and-forget after the change commits.
 */
@Injectable()
export class SubscriptionAlertsService implements OnModuleInit {
  private readonly log = new Logger(SubscriptionAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly fanout?: CaseFanoutService,
    @Optional() private readonly outbox?: CrossFamilyOutbox,
  ) {}

  /** X1: the relay (`outbox.sweep`, in the worker) and `flush` (in the API)
   * both run the recorded case-alert starts through this. */
  onModuleInit(): void {
    registerAfterCommitEffect(CASE_ALERTS_EVENT, (p: CaseAlertsPayload) =>
      shardContext.runFromKey(p.shardKey, async () => {
        if (p.mode === 'urgent_top_up') await this.urgentTopUp(p.caseId);
        else await this.attorneysForCase(p.caseId);
      }),
    );
  }

  /**
   * THIRD_PASS_A X1 (26.11): the new-case alert round of [caseId] as a
   * durable record (transactional outbox) written in the caller's
   * transaction [tx], next to the case change itself. Before, the round was
   * a bare `setImmediate` after the commit: a crash, an OOM, a deploy kill,
   * a Redis error or a database blip in that window lost the alerts for
   * good. Now `flushCaseAlerts` starts it right after the commit and the
   * every-minute `outbox.sweep` relay re-runs whatever did not finish
   * (backoff 5 s … 1 h, dead letter `cross_family_outbox_dead` after 8
   * tries). Safe to run twice: the wave job id and the per-person dedupe key
   * are per case and generation. Null (old in-process path) without the
   * outbox (unit tests) and in the demo world (a separate database the relay
   * does not sweep; demo pushes are off anyway).
   */
  async recordCaseAlerts(
    tx: DbTx,
    caseId: string,
    generation: number,
    mode: CaseAlertsPayload['mode'] = 'start',
  ): Promise<CaseAlertsTicket> {
    if (!this.outbox || !this.fanout || demoContext.isDemo()) {
      return { caseId, mode, ticket: null };
    }
    const payload: CaseAlertsPayload = {
      caseId,
      mode,
      shardKey: shardCarry().shardKey ?? shardKeyOf.case(caseId),
    };
    const ticket = await this.outbox.emit(
      tx,
      CASE_ALERTS_EVENT,
      { ...payload },
      `case_alerts:${mode}:${caseId}:g${generation}`,
    );
    return { caseId, mode, ticket };
  }

  /** After the commit: runs the recorded round now, after the response
   * (the relay retries it when this attempt does not finish). */
  flushCaseAlerts(t: CaseAlertsTicket): void {
    const outbox = this.outbox;
    const ticket = t.ticket;
    if (outbox && ticket) {
      // flush never throws; a failure stays pending for the sweep.
      this.later(() => outbox.flush([ticket]), { caseId: t.caseId });
      return;
    }
    this.later(
      () =>
        t.mode === 'urgent_top_up'
          ? this.urgentTopUp(t.caseId)
          : this.attorneysForCase(t.caseId),
      { caseId: t.caseId },
    );
  }

  /** [recordCaseAlerts] in its own small transaction, for a change that
   * already committed (the urgent top-up is decided after the update). */
  async recordAndFlushCaseAlerts(
    caseId: string,
    mode: CaseAlertsPayload['mode'],
  ): Promise<void> {
    let t: CaseAlertsTicket = { caseId, mode, ticket: null };
    try {
      await withTxRetry(
        this.prisma,
        async (tx) => {
          const kase = await tx.case.findUnique({
            where: { id: caseId },
            select: { alert_generation: true },
          });
          if (!kase) return;
          t = await this.recordCaseAlerts(
            tx,
            caseId,
            kase.alert_generation,
            mode,
          );
        },
        { isolation: 'readCommitted' },
      );
    } catch (e) {
      // The record failed (database blip): still try in-process, as before.
      this.log.error(`alert record failed for case ${caseId}: ${String(e)}`);
      t = { caseId, mode, ticket: null };
    }
    this.flushCaseAlerts(t);
  }

  /** A published post / news of [authorId], alerted right here batch after
   * batch (no Redis, tests). With Redis PostFanoutService queues the same
   * batches so a restart cannot lose them. */
  async followersOfPost(
    authorId: string,
    postId: string,
    brief = false,
  ): Promise<number> {
    let total = 0;
    let after: string | null = null;
    do {
      const r = await this.alertBatch(authorId, postId, brief, after);
      total += r.sent;
      after = r.next;
    } while (after && total < ALERT_FANOUT_MAX);
    return total;
  }

  /**
   * Audit A-1: ONE batch of followers (keyset on follower_id after [after],
   * ALERT_BATCH people) written through emitMany (one INSERT, one badge drop,
   * one push enqueue) with the dedupe key `followed_post:<postId>`, so a
   * retried batch, a republish or a re-run alerts nobody twice. Returns the
   * rows written and the cursor of the next batch (null: no more).
   */
  async alertBatch(
    authorId: string,
    postId: string,
    brief: boolean,
    after: string | null,
  ): Promise<{ sent: number; next: string | null }> {
    const payload = {
      postId,
      actorId: authorId,
      ...(brief ? { kind: 'brief' } : {}),
    };
    const send = (ids: string[]) =>
      this.notifications.emitMany({
        type: 'followed_post',
        recipientIds: ids,
        payload,
        dedupeKey: `followed_post:${postId}`,
      });
    if (readsAreSplit(this.prisma)) {
      // Pack E (25.11, ROUND2 #17): sharded reads page the follows by the
      // same keyset as below (ALERT_BATCH a read, ALERT_FANOUT_MAX in all
      // through the callers) instead of loading every follower into memory
      // and an IN (…) of a million ids.
      const page = await this.followersSplit(authorId, after);
      const sent = page.ids.length > 0 ? await send(page.ids) : 0;
      return { sent, next: page.next };
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT f.follower_id::TEXT AS id
      FROM follows f
      JOIN notification_settings s
        ON s.user_id = f.follower_id AND s.category = 'following'
       AND s.push_enabled
      JOIN users u ON u.id = f.follower_id
       AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE f.followee_id = ${authorId}::UUID
        AND f.follower_id > ${after ?? '00000000-0000-0000-0000-000000000000'}::UUID
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = f.follower_id AND b.blocked_id = ${authorId}::UUID)
             OR (b.blocker_id = ${authorId}::UUID AND b.blocked_id = f.follower_id))
      ORDER BY f.follower_id
      LIMIT ${ALERT_BATCH}`;
    if (rows.length === 0) return { sent: 0, next: null };
    const sent = await send(rows.map((r) => r.id));
    return {
      sent,
      next: rows.length === ALERT_BATCH ? rows[rows.length - 1].id : null,
    };
  }

  /**
   * A newly published case. Owner 2026-10-25: no longer "everyone at once
   * in this request" — CaseFanoutService scores the audience (CaseAudience
   * Service: the qualifications chosen for alerts, verified licence states,
   * "New cases" push on, blocks) and sends it in waves through the
   * `case-fanout` queue. Returns the alerts sent in this call (all of them while the waves
   * switch is off; 0 when queued: the count is a metric of the waves).
   */
  async attorneysForCase(caseId: string): Promise<number> {
    return (await this.fanout?.start(caseId)) ?? 0;
  }

  /** Algo audit 2026-10-27 (CASES C-1): the case became urgent — the
   * «Только срочные» attorneys (left out so far) are told now. */
  async urgentTopUp(caseId: string): Promise<number> {
    return (await this.fanout?.startExtra(caseId, 'urgent_top_up')) ?? 0;
  }

  /** Algo audit 2026-10-27 (CASES M-3): no offers after [tag] — whoever in
   * the audience was not alerted yet is told (never anyone twice). */
  async rebroadcast(caseId: string, tag: string): Promise<number> {
    return (await this.fanout?.startExtra(caseId, 'rebroadcast', tag)) ?? 0;
  }

  /**
   * One alertBatch() page for several databases (shard-ready step 8): the
   * follows (user family, scattered) after [after] by follower id, then the
   * people's status (global), their "following" push setting (user family)
   * and blocks either way for that page, in four reads instead of one
   * statement that joins all of them. [next] follows the follows page, not
   * the filtered ids, so a page with nobody to alert still moves on.
   */
  private async followersSplit(
    authorId: string,
    after: string | null,
  ): Promise<{ ids: string[]; next: string | null }> {
    const follows = await this.prisma.follow.findMany({
      where: {
        followee_id: authorId,
        ...(after ? { follower_id: { gt: after } } : {}),
      },
      orderBy: { follower_id: 'asc' },
      take: ALERT_BATCH,
      select: { follower_id: true },
    });
    const ids = follows.map((f) => f.follower_id);
    if (ids.length === 0) return { ids: [], next: null };
    const next = ids.length === ALERT_BATCH ? ids[ids.length - 1] : null;
    const [settings, users, blocks] = await Promise.all([
      this.prisma.notificationSetting.findMany({
        where: {
          user_id: { in: ids },
          category: 'following',
          push_enabled: true,
        },
        select: { user_id: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: ids }, status: 'active', deleted_at: null },
        select: { id: true },
      }),
      this.prisma.userBlock.findMany({
        where: {
          OR: [
            { blocker_id: { in: ids }, blocked_id: authorId },
            { blocker_id: authorId, blocked_id: { in: ids } },
          ],
        },
        select: { blocker_id: true, blocked_id: true },
      }),
    ]);
    const pushOn = new Set(settings.map((x) => x.user_id));
    const active = new Set(users.map((x) => x.id));
    const blocked = new Set(
      blocks.map((b) =>
        b.blocker_id === authorId ? b.blocked_id : b.blocker_id,
      ),
    );
    return {
      ids: ids.filter(
        (id) => pushOn.has(id) && active.has(id) && !blocked.has(id),
      ),
      next,
    };
  }
  /**
   * Runs [job] after the response without failing the request. Algo audit
   * 2026-10-27 (CASES H-1): with Redis the job only queues the wave (the
   * worker retries), so a failure here means the case reached nobody —
   * logged as an error with the case id, so the ops alarm catches it.
   */
  later(job: () => Promise<unknown>, context: { caseId?: string } = {}): void {
    setImmediate(() => {
      job().catch((e: unknown) =>
        this.log.error(
          `alert fan-out failed${context.caseId ? ` for case ${context.caseId}` : ''}: ${String(e)}`,
        ),
      );
    });
  }
}
