import { Injectable } from '@nestjs/common';
import { NotificationCategory, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
  comment_reply: 'social',
  comment_like: 'social',
  verification_update: 'system',
  subscription_trial_ending: 'system',
  subscription_payment_failed: 'system',
  subscription_status: 'system',
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
 * Seam for file 03: today it only persists the `notifications` row (step
 * 2 of §9.3), optionally inside the caller's transaction so the
 * notification commits atomically with the change it announces. Settings,
 * aggregation/dedupe, realtime, push and email delivery (§9.3 steps 1, 3-5,
 * §9.4) are added behind this same signature by docs/05 stage 5.x
 * ("Раздел 9 и 10: NotificationsService.emit ...").
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the stored row id, or null for `new_message`, which is
   * push-only and never stored (docs/05 §9.2). */
  async emit(
    input: NotificationEmit,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string } | null> {
    if (input.type === 'new_message') return null;
    const db = tx ?? this.prisma;
    return db.notification.create({
      data: {
        user_id: input.recipientId,
        type: input.type,
        category: NOTIFICATION_CATEGORY[input.type],
        payload: input.payload,
      },
      select: { id: true },
    });
  }
}
