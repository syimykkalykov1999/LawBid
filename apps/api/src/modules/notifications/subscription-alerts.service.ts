import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  effectiveUrgency,
  loadUrgencyThresholds,
  URGENT_LEVELS,
} from '../cases/domain/case-urgency';
import { PrismaService } from '../../prisma/prisma.service';
import { readsAreSplit } from '../../sharding/split-reads';
import { NotificationsService } from './notifications.service';

/** One post or case alerts at most this many people (a later stage can
 * fan out through a queue). */
export const ALERT_FANOUT_MAX = 5000;

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
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /** A published post / news of [authorId]. */
  async followersOfPost(
    authorId: string,
    postId: string,
    brief = false,
  ): Promise<number> {
    const rows = readsAreSplit(this.prisma)
      ? await this.followersSplit(authorId)
      : await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT f.follower_id::TEXT AS id
      FROM follows f
      JOIN notification_settings s
        ON s.user_id = f.follower_id AND s.category = 'following'
       AND s.push_enabled
      JOIN users u ON u.id = f.follower_id
       AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE f.followee_id = ${authorId}::UUID
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = f.follower_id AND b.blocked_id = ${authorId}::UUID)
             OR (b.blocker_id = ${authorId}::UUID AND b.blocked_id = f.follower_id))
      LIMIT ${ALERT_FANOUT_MAX}`;
    for (const r of rows) {
      await this.notifications.emit({
        type: 'followed_post',
        recipientId: r.id,
        payload: {
          postId,
          actorId: authorId,
          ...(brief ? { kind: 'brief' } : {}),
        },
      });
    }
    return rows.length;
  }

  /**
   * A newly published case. Owner 2026-10-01: only the qualifications the
   * attorney chose for alerts — by default the profile's, or their own
   * list (a category covers its subcategories) — and only in states where
   * they hold a verified license.
   */
  async attorneysForCase(caseId: string): Promise<number> {
    // Owner 2026-10-05: an urgent case says so in the push, and is the
    // only kind that reaches attorneys who chose "urgent cases only".
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { urgency: true, deadline_at: true },
    });
    if (!kase) return 0;
    const level = effectiveUrgency(
      kase.urgency,
      kase.deadline_at,
      new Date(),
      await loadUrgencyThresholds(this.settings),
    );
    const urgent = level !== null && URGENT_LEVELS.includes(level);
    const rows = readsAreSplit(this.prisma)
      ? await this.attorneysSplit(caseId, urgent)
      : await this.prisma.$queryRaw<{ id: string }[]>`
      WITH c AS (
        SELECT c.id, c.client_id, c.practice_area_id, pa.parent_id, pa.code
        FROM cases c
        JOIN practice_areas pa ON pa.id = c.practice_area_id
        WHERE c.id = ${caseId}::UUID
      ), chosen AS (
        SELECT ap.attorney_id, ap.practice_area_id
        FROM attorney_practice_areas ap
        JOIN attorney_profiles p ON p.user_id = ap.attorney_id
         AND NOT p.new_case_alerts_custom
        UNION ALL
        SELECT n.attorney_id, n.practice_area_id
        FROM new_case_alert_practices n
        JOIN attorney_profiles p ON p.user_id = n.attorney_id
         AND p.new_case_alerts_custom
      )
      SELECT DISTINCT ch.attorney_id::TEXT AS id
      FROM c
      JOIN chosen ch ON ch.practice_area_id = c.practice_area_id
                     OR ch.practice_area_id = c.parent_id
                     -- Owner 2026-10-15: any of the case's other topics.
                     OR ch.practice_area_id IN (
                       SELECT x.practice_area_id FROM case_extra_practices x
                       WHERE x.case_id = c.id)
                     -- Audit 2026-10-01: like the case feed (§4.1), "Not
                     -- sure" cases also go to General Practice attorneys.
                     OR (c.code = 'general_practice.not_sure_or_other'
                         AND ch.practice_area_id = (
                           SELECT id FROM practice_areas
                           WHERE code = 'general_practice.general_practice'))
      JOIN attorney_profiles p ON p.user_id = ch.attorney_id
       AND p.verification_status = 'verified'
       AND (NOT p.new_case_alerts_urgent_only OR ${urgent})
      JOIN case_states cs ON cs.case_id = c.id
      JOIN attorney_licenses l ON l.attorney_id = ch.attorney_id
       AND l.state_code = cs.state_code AND l.license_status = 'verified'
      JOIN notification_settings s
        ON s.user_id = ch.attorney_id AND s.category = 'new_cases'
       AND s.push_enabled
      JOIN users u ON u.id = ch.attorney_id
       AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ch.attorney_id AND b.blocked_id = c.client_id)
             OR (b.blocker_id = c.client_id AND b.blocked_id = ch.attorney_id))
      LIMIT ${ALERT_FANOUT_MAX}`;
    for (const r of rows) {
      await this.notifications.emit({
        type: urgent ? 'new_urgent_case' : 'new_case',
        recipientId: r.id,
        payload: { caseId },
      });
    }
    return rows.length;
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

  /** attorneysForCase() for several databases: the case (with states and
   * extra topics) from its shard, then attorneys from the global family. */
  private async attorneysSplit(
    caseId: string,
    urgent: boolean,
  ): Promise<{ id: string }[]> {
    const c = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        client_id: true,
        practice_area_id: true,
        states: { select: { state_code: true } },
        extra_practices: { select: { practice_area_id: true } },
      },
    });
    if (!c) return [];
    const pa = await this.prisma.practiceArea.findUnique({
      where: { id: c.practice_area_id },
      select: { parent_id: true, code: true },
    });
    const matching = new Set<string>([
      c.practice_area_id,
      ...(pa?.parent_id ? [pa.parent_id] : []),
      ...c.extra_practices.map((x) => x.practice_area_id),
    ]);
    if (pa?.code === 'general_practice.not_sure_or_other') {
      const general = await this.prisma.practiceArea.findFirst({
        where: { code: 'general_practice.general_practice' },
        select: { id: true },
      });
      if (general) matching.add(general.id);
    }
    const areas = [...matching];
    const states = c.states.map((x) => x.state_code);
    if (states.length === 0) return [];
    const profiles = await this.prisma.attorneyProfile.findMany({
      where: {
        verification_status: 'verified',
        ...(urgent ? {} : { new_case_alerts_urgent_only: false }),
        OR: [
          {
            new_case_alerts_custom: false,
            practice_areas: { some: { practice_area_id: { in: areas } } },
          },
          {
            new_case_alerts_custom: true,
            new_case_alert_practices: {
              some: { practice_area_id: { in: areas } },
            },
          },
        ],
        licenses: {
          some: { license_status: 'verified', state_code: { in: states } },
        },
      },
      select: { user_id: true },
      take: ALERT_FANOUT_MAX * 4,
    });
    const ids = profiles.map((p) => p.user_id);
    if (ids.length === 0) return [];
    const [settings, users, blocks] = await Promise.all([
      this.prisma.notificationSetting.findMany({
        where: {
          user_id: { in: ids },
          category: 'new_cases',
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
            { blocker_id: { in: ids }, blocked_id: c.client_id },
            { blocker_id: c.client_id, blocked_id: { in: ids } },
          ],
        },
        select: { blocker_id: true, blocked_id: true },
      }),
    ]);
    const pushOn = new Set(settings.map((x) => x.user_id));
    const active = new Set(users.map((x) => x.id));
    const blocked = new Set(
      blocks.map((b) =>
        b.blocker_id === c.client_id ? b.blocked_id : b.blocker_id,
      ),
    );
    return ids
      .filter((id) => pushOn.has(id) && active.has(id) && !blocked.has(id))
      .slice(0, ALERT_FANOUT_MAX)
      .map((id) => ({ id }));
  }

  /** Runs [job] after the response without failing the request. */
  later(job: () => Promise<unknown>): void {
    setImmediate(() => {
      job().catch((e: unknown) =>
        this.log.warn(`alert fan-out failed: ${String(e)}`),
      );
    });
  }
}
