import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
  ) {}

  /** A published post / news of [authorId]. */
  async followersOfPost(authorId: string, postId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT f.follower_id::STRING AS id
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
        payload: { postId, actorId: authorId },
      });
    }
    return rows.length;
  }

  /** A newly published case. */
  async attorneysForCase(caseId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ap.attorney_id::STRING AS id
      FROM cases c
      JOIN attorney_practice_areas ap ON ap.practice_area_id = c.practice_area_id
      JOIN attorney_profiles p ON p.user_id = ap.attorney_id
       AND p.verification_status = 'verified'
      JOIN case_states cs ON cs.case_id = c.id
      JOIN attorney_licenses l ON l.attorney_id = ap.attorney_id
       AND l.state_code = cs.state_code AND l.license_status = 'verified'
      JOIN notification_settings s
        ON s.user_id = ap.attorney_id AND s.category = 'new_cases'
       AND s.push_enabled
      JOIN users u ON u.id = ap.attorney_id
       AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE c.id = ${caseId}::UUID
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ap.attorney_id AND b.blocked_id = c.client_id)
             OR (b.blocker_id = c.client_id AND b.blocked_id = ap.attorney_id))
      LIMIT ${ALERT_FANOUT_MAX}`;
    for (const r of rows) {
      await this.notifications.emit({
        type: 'new_case',
        recipientId: r.id,
        payload: { caseId },
      });
    }
    return rows.length;
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
