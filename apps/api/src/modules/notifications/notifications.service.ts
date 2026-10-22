import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { NotificationCategory, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { BadgesService } from './badges.service';
import { dedupeKeyFor } from './notification-rules';
import { PushQueueService } from './push/push-queue.service';
import { blockedEitherWay } from '../blocks/block-guard';

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
  // Owner 2026-10-05.
  case_invite_received: 'bids',
  case_invite_declined: 'bids',
  case_updated: 'cases',
  // Owner 2026-10-05: the case's date.
  case_deadline_soon: 'cases',
  case_deadline_today: 'cases',
  case_deadline_passed: 'cases',
  case_deadline_changed: 'cases',
  case_stale_prompt: 'cases',
  // Owner 2026-10-18 (OQ-054).
  case_still_needed: 'cases',
  // Audit 2026-10-19.
  case_workspace_activity: 'cases',
  case_archived: 'cases',
  completion_requested: 'cases',
  completion_reminder: 'cases',
  case_closed: 'cases',
  case_disputed: 'cases',
  dispute_resolved: 'cases',
  contact_issue_update: 'cases',
  review_requested: 'cases',
  review_received: 'cases',
  new_message: 'messages',
  new_follower: 'social',
  post_like: 'social',
  // Owner 2026-10-07: Threads-style reposts.
  post_repost: 'social',
  // Owner 2026-10-20: a gift on the profile.
  gift_received: 'social',
  post_comment: 'social',
  case_comment: 'bids',
  // OQ-041: a call nobody answered (own category, owner 2026-09-30).
  missed_call: 'calls',
  // OQ-042.
  mention: 'social',
  // Owner 2026-09-30, opt-in.
  followed_post: 'following',
  // Owner 2026-10-20: a post in a channel I subscribed to.
  channel_post: 'channels',
  // Owner 2026-10-21: an invitation to a group.
  group_invite: 'groups',
  // Owner 2026-10-22: someone from my phone book joined LawBid.
  contact_joined: 'social',
  // OQ-048: the attorney's team.
  assistant_request: 'messages',
  assistant_task: 'cases',
  assistant_joined: 'system',
  assistant_result: 'messages',
  // Owner 2026-10-21 (inbox 30).
  assistant_bid_draft: 'bids',
  // Owner 2026-10-05: the planner.
  task_reminder: 'cases',
  task_assigned: 'cases',
  task_purge_soon: 'system',
  admin_broadcast: 'system',
  referral_reward: 'system',
  // Owner 2026-10-05: partner program.
  partner_commission: 'system',
  partner_payout: 'system',
  partner_approved: 'system',
  partner_declined: 'system',
  promotion_started: 'cases',
  promotion_ended: 'cases',
  // Owner 2026-10-05: client → attorney payments.
  case_payment_received: 'cases',
  case_payment_sent: 'cases',
  case_payment_refunded: 'cases',
  case_payment_disputed: 'cases',
  payout_account_status: 'system',
  payment_request_created: 'cases',
  payment_request_due: 'cases',
  payment_request_overdue: 'cases',
  payment_request_canceled: 'cases',
  payment_fee_countered: 'cases',
  payment_fee_agreed: 'cases',
  new_case: 'new_cases',
  new_urgent_case: 'new_cases',
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
  security_phone_changed: 'system',
  security_sign_in_changed: 'system',
  // Owner 2026-10-20: booking and «Вопрос юристу».
  consultation_update: 'cases',
  legal_question_new: 'new_cases',
  legal_answer_update: 'cases',
};

/**
 * Owner 2026-10-06: the bell's "Важные" / "Остальные" tabs. Important =
 * what needs the person (bids, cases, payments, chats, the account);
 * the rest = likes, follows, comments, followed posts, logins. A total
 * Record: a new type fails compilation until it is placed.
 */
export const NOTIFICATION_IMPORTANT: Record<NotificationType, boolean> = {
  bid_received: true,
  offer_countered: true,
  offer_accepted: true,
  bid_accepted: true,
  bid_rejected: true,
  negotiation_failed: true,
  case_invite_received: true,
  case_invite_declined: true,
  case_updated: true,
  case_deadline_soon: true,
  case_deadline_today: true,
  case_deadline_passed: true,
  case_deadline_changed: true,
  case_stale_prompt: true,
  case_still_needed: true,
  case_workspace_activity: true,
  case_archived: true,
  completion_requested: true,
  completion_reminder: true,
  case_closed: true,
  case_disputed: true,
  dispute_resolved: true,
  contact_issue_update: true,
  review_requested: true,
  review_received: true,
  new_message: true,
  new_follower: false,
  post_like: false,
  post_repost: false,
  gift_received: true,
  post_comment: false,
  case_comment: false,
  missed_call: true,
  mention: false,
  followed_post: false,
  channel_post: false,
  group_invite: true,
  contact_joined: false,
  assistant_request: true,
  assistant_task: true,
  assistant_bid_draft: true,
  assistant_joined: false,
  assistant_result: true,
  task_reminder: true,
  task_assigned: true,
  task_purge_soon: false,
  admin_broadcast: true,
  referral_reward: false,
  partner_commission: false,
  partner_payout: false,
  partner_approved: false,
  partner_declined: false,
  promotion_started: false,
  promotion_ended: false,
  case_payment_received: true,
  case_payment_sent: true,
  case_payment_refunded: true,
  case_payment_disputed: true,
  payout_account_status: true,
  payment_request_created: true,
  payment_request_due: true,
  payment_request_overdue: true,
  payment_request_canceled: true,
  payment_fee_countered: true,
  payment_fee_agreed: true,
  new_case: false,
  new_urgent_case: true,
  comment_reply: false,
  comment_like: false,
  verification_update: true,
  subscription_trial_ending: true,
  subscription_payment_failed: true,
  subscription_status: true,
  data_export_ready: false,
  case_history_export_ready: false,
  moderation_notice: true,
  security_new_device: false,
  security_phone_changed: true,
  security_sign_in_changed: true,
  consultation_update: true,
  legal_question_new: false,
  legal_answer_update: true,
};

/** The types of one bell tab. */
export function notificationTypesOf(important: boolean): NotificationType[] {
  return (Object.keys(NOTIFICATION_IMPORTANT) as NotificationType[]).filter(
    (t) => NOTIFICATION_IMPORTANT[t] === important,
  );
}

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
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** Audit 2026-10-01: like → unlike → like (or follow → unfollow →
   * follow) notifies once a day per person and object — the toggles used
   * to re-push and inflate "and N others". */
  private async firstToday(
    type: string,
    actorId: string,
    recipientId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.redis) return true;
    const id = payload.postId ?? payload.commentId;
    const object = typeof id === 'string' ? id : '';
    try {
      const set = await this.redis.set(
        `notif:once:${type}:${actorId}:${recipientId}:${object}`,
        '1',
        'EX',
        86_400,
        'NX',
      );
      return set === 'OK';
    } catch {
      return true;
    }
  }

  /**
   * Owner 2026-10-22 (server load audit, finding 7): the same notification
   * for many people (a channel post's subscribers) — one INSERT, the badge
   * caches dropped in one round trip, the deliveries queued in one. Every
   * row carries [dedupeKey]: (user_id, dedupe_key) is unique, so a retried
   * batch inserts — and pushes — nothing twice. Not for blocked-actor or
   * aggregated types (use [emit]). Returns the rows written.
   */
  async emitMany(input: {
    type: NotificationType;
    recipientIds: string[];
    payload: Prisma.InputJsonObject;
    dedupeKey: string;
  }): Promise<number> {
    if (input.recipientIds.length === 0) return 0;
    const category = NOTIFICATION_CATEGORY[input.type];
    const rows = await this.prisma.notification.createManyAndReturn({
      data: input.recipientIds.map((user_id) => ({
        user_id,
        type: input.type,
        category,
        payload: input.payload,
        dedupe_key: input.dedupeKey,
      })),
      skipDuplicates: true,
      select: { id: true, user_id: true },
    });
    await this.badges?.invalidateNotificationsMany(rows.map((r) => r.user_id));
    await this.push?.enqueueMany(
      rows.map((r) => r.id),
      input.type,
    );
    return rows.length;
  }

  /** Owner 2026-10-22 (finding 7): a group message's pushes for many
   * members at once (`new_message` is never stored, like [emit]). */
  async queueGroupMessagePushes(data: {
    groupId: string;
    messageId: string;
    recipientIds: string[];
  }): Promise<void> {
    if (data.recipientIds.length === 0) return;
    await this.push?.enqueueGroupMessages(data);
  }

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
          ...(typeof p.groupId === 'string' ? { groupId: p.groupId } : {}),
          // Owner 2026-10-20: a reaction / edit of an earlier message.
          ...(p.event === 'reaction' || p.event === 'edit'
            ? {
                event: p.event,
                actorId: typeof p.actorId === 'string' ? p.actorId : undefined,
                emoji: typeof p.emoji === 'string' ? p.emoji : undefined,
              }
            : {}),
        });
      }
      return null;
    }
    const db = tx ?? this.prisma;
    // Audit 2026-10-01: nothing reaches a person from someone they
    // blocked (or who blocked them).
    const actorId = (input.payload as Record<string, unknown> | null)?.actorId;
    if (
      typeof actorId === 'string' &&
      (await blockedEitherWay(db, actorId, input.recipientId))
    ) {
      return null;
    }
    if (
      typeof actorId === 'string' &&
      ['post_like', 'post_repost', 'comment_like', 'new_follower'].includes(
        input.type,
      ) &&
      !(await this.firstToday(
        input.type,
        actorId,
        input.recipientId,
        input.payload,
      ))
    ) {
      return null;
    }
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
        RETURNING id::TEXT AS id, aggregate_count::INT8 AS n`;
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
