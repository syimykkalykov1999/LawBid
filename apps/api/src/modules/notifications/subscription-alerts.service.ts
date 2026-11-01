import { Injectable, Logger, Optional } from '@nestjs/common';
import { CaseFanoutService } from './case-fanout/case-fanout.service';
import { PrismaService } from '../../prisma/prisma.service';
import { readsAreSplit } from '../../sharding/split-reads';
import { NotificationsService } from './notifications.service';

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
export class SubscriptionAlertsService {
  private readonly log = new Logger(SubscriptionAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly fanout?: CaseFanoutService,
  ) {}

  /** A published post / news of [authorId]. */
  async followersOfPost(
    authorId: string,
    postId: string,
    brief = false,
  ): Promise<number> {
    // Audit A-1: batches of ALERT_BATCH through emitMany (one INSERT, one
    // badge drop, one push enqueue per batch instead of ~6 round trips per
    // follower) with a keyset cursor, so a big audience is no longer cut at
    // the first rows. The row carries a dedupe key: a retry or a republish of
    // the same post alerts nobody twice.
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
    let total = 0;
    if (readsAreSplit(this.prisma)) {
      const rows = await this.followersSplit(authorId);
      for (let i = 0; i < rows.length; i += ALERT_BATCH) {
        total += await send(rows.slice(i, i + ALERT_BATCH).map((r) => r.id));
      }
      return total;
    }
    let cursor = '00000000-0000-0000-0000-000000000000';
    for (let sent = 0; sent < ALERT_FANOUT_MAX;) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT f.follower_id::TEXT AS id
      FROM follows f
      JOIN notification_settings s
        ON s.user_id = f.follower_id AND s.category = 'following'
       AND s.push_enabled
      JOIN users u ON u.id = f.follower_id
       AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE f.followee_id = ${authorId}::UUID
        AND f.follower_id > ${cursor}::UUID
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = f.follower_id AND b.blocked_id = ${authorId}::UUID)
             OR (b.blocker_id = ${authorId}::UUID AND b.blocked_id = f.follower_id))
      ORDER BY f.follower_id
      LIMIT ${ALERT_BATCH}`;
      if (rows.length === 0) break;
      total += await send(rows.map((r) => r.id));
      sent += rows.length;
      cursor = rows[rows.length - 1].id;
      if (rows.length < ALERT_BATCH) break;
    }
    return total;
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
   * followersOfPost() for several databases (shard-ready step 8): the
   * follows (user family, scattered), the people's status (global), their
   * "following" push setting (user family) and blocks either way, in four
   * reads instead of one statement that joins all of them.
   */
  private async followersSplit(authorId: string): Promise<{ id: string }[]> {
    const follows = await this.prisma.follow.findMany({
      where: { followee_id: authorId },
      select: { follower_id: true },
    });
    const ids = follows.map((f) => f.follower_id);
    if (ids.length === 0) return [];
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
    return ids
      .filter((id) => pushOn.has(id) && active.has(id) && !blocked.has(id))
      .slice(0, ALERT_FANOUT_MAX)
      .map((id) => ({ id }));
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
