import { Injectable } from '@nestjs/common';
import type {
  NotificationCategory,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  /** Machine-readable payload; the app renders it through i18n keys
   * (`notif.<area>.*`), so no user-facing text is stored here. */
  payload: Prisma.InputJsonObject;
}

/** Settings group (notification_category) of each notification type. */
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
  contact_issue_update: 'system',
  moderation_notice: 'system',
  security_new_device: 'system',
  review_requested: 'cases',
  review_received: 'social',
};

/**
 * The single seam every feature uses to notify a user (.cursorrules
 * "Уведомления только через NotificationsService.emit()"). For now it
 * persists the `notifications` row (the in-app "Уведомления" list);
 * push delivery, quiet hours and per-category settings are built behind
 * this method in docs/05 without changing callers.
 *
 * Pass the caller's transaction as [tx] when the notification must commit
 * atomically with the state change that caused it.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NotificationsService.name);
  }

  async emit(input: NotificationInput, tx?: Tx): Promise<{ id: string }> {
    const db = tx ?? this.prisma;
    const row = await db.notification.create({
      data: {
        user_id: input.userId,
        type: input.type,
        category: NOTIFICATION_CATEGORY[input.type],
        payload: input.payload,
      },
      select: { id: true },
    });
    // TODO(docs/05 notifications stage): push delivery behind this seam.
    this.logger.debug({ id: row.id, type: input.type }, 'notification stored');
    return row;
  }
}
