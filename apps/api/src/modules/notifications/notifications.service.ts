import { Injectable, Optional } from '@nestjs/common';
import { NotificationCategory, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BadgesService } from './badges.service';
import { dedupeKeyFor } from './notification-rules';
import { PushQueueService } from './push/push-queue.service';

/** docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md §9.2: category of every
 * notification type (drives the per-category settings of §9.5). Typed as
 * a total Record so a new enum value fails compilation until mapped. */
export const NOTIFICATION_CATEGORY: Record<
  NotificationType,
  NotificationCategory
> = {
  bid_received: 'bids',
  offer_countered: 'bids',
  offer_accepted: 'bids',
  bid_accepted: 'bids',
  bid_rejected: 'bids',
  negotiation_failed: 'bids',
  case_updated: 'cases',
  case_stale_prompt: 'cases',
  case_archived: 'cases',
  completion_requested: 'cases',
  completion_reminder: 'cases',
  case_closed: 'cases',
  contact_issue_update: 'cases',
  review_requested: 'cases',
  review_received: 'cases',
  new_message: 'messages',
  new_follower: 'social',
  post_like: 'social',
  post_comment: 'social',
  case_comment: 'bids',
  comment_reply: 'social',
  comment_like: 'social',
  verification_update: 'system',
  subscription_trial_ending: 'system',
  subscription_payment_failed: 'system',
  subscription_status: 'system',
  data_export_ready: 'system',
  case_history_export_ready: 'system',
  moderation_notice: 'system',
  security_new_device: 'system',
};

export interface NotificationEmit {
  type: NotificationType;
  recipientId: string;
  /** Identifiers and template params only (docs/05 §9.5: no sensitive
   * data — the text is a localized `notif.<type>` template). */
  payload: Prisma.InputJsonObject;
}

/**
 * The single entry point for creating notifications (docs/05 §9.3,
 * .cursorrules "Уведомления только через NotificationsService.emit()").
 *
 * Stores the row (optionally inside the caller's transaction, so it
 * commits atomically with the change it announces), aggregating
 * post_like / comment_like / new_follower per object and hour (§9.4:
 * `dedupe_key`, `aggregate_count`), and queues delivery. The `push` queue
 * job runs after commit: realtime `notification:new` + `badge:update`,
 * then — per settings, quiet hours and push rules — push and, for
 * `system`, email (PushDispatcher). `new_message` is never stored: it only
 * queues its push (§9.2).
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly push?: PushQueueService,
    @Optional() private readonly badges?: BadgesService,
  ) {}

  /** Returns the stored row id, or null for `new_message`. */
  async emit(
    input: NotificationEmit,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string } | null> {
    if (input.type === 'new_message') {
      const p = input.payload as Record<string, unknown>;
      if (
        typeof p.conversationId === 'string' &&
        typeof p.messageId === 'string'
      ) {
        await this.push?.enqueueMessage({
          recipientId: input.recipientId,
          conversationId: p.conversationId,
          messageId: p.messageId,
        });
      }
      return null;
    }
    const db = tx ?? this.prisma;
    const category = NOTIFICATION_CATEGORY[input.type];
    const dedupe = dedupeKeyFor(input.type, input.payload, new Date());
    if (dedupe) {
      // One row per window: later events bump the count, carry the latest
      // actor ("Sarah и ещё 5"), come back unread and move to the top.
      const [row] = await db.$queryRaw<{ id: string; n: number }[]>`
        INSERT INTO notifications (user_id, type, category, payload, dedupe_key)
        VALUES (${input.recipientId}::UUID,
                ${input.type}::notification_type,
                ${category}::notification_category,
                ${JSON.stringify(input.payload)}::JSONB,
                ${dedupe})
        ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
        DO UPDATE SET aggregate_count = notifications.aggregate_count + 1,
                      payload = excluded.payload,
                      read_at = NULL,
                      created_at = now()
        RETURNING id::STRING AS id, aggregate_count::INT8 AS n`;
      await this.badges?.invalidateNotifications(input.recipientId);
      await this.push?.enqueue(row.id, input.type, Number(row.n));
      return { id: row.id };
    }
    const row = await db.notification.create({
      data: {
        user_id: input.recipientId,
        type: input.type,
        category,
        payload: input.payload,
      },
      select: { id: true },
    });
    // jobId = row id → at most one delivery per stored event; delayed so
    // the caller's transaction commits first (a rolled-back row is dropped
    // by the dispatcher).
    await this.badges?.invalidateNotifications(input.recipientId);
    await this.push?.enqueue(row.id, input.type);
    return row;
  }
}
