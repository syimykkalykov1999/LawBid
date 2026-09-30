import type { NotificationType } from '@prisma/client';

/** docs/06 §6: BullMQ queue `push`. */
export const PUSH_QUEUE = 'push';
export const PUSH_JOB = 'push.send';
export const PUSH_MODULE_OPTIONS = Symbol('PUSH_MODULE_OPTIONS');
export const PUSH_SENDER = Symbol('PUSH_SENDER');
export const NOTIFICATION_EMAIL = Symbol('NOTIFICATION_EMAIL');

/**
 * Types that get a push (docs/04 §13 "Push" column; docs/05 §9.5 for the
 * rest): `case_updated` is list-only, likes are list-only, `new_message`
 * is push-only and pushed by the chat itself (docs/05).
 */
export const NO_PUSH_TYPES: ReadonlySet<NotificationType> = new Set([
  'case_updated',
  'post_like',
  'comment_like',
]);

/** Job options: delayed so the emitting transaction has committed before
 * the dispatcher reads the row; a row still missing is retried, then the
 * job is dropped (its transaction rolled back). jobId = notification id,
 * so an event is queued at most once per stored row. */
export const PUSH_JOB_OPTS = {
  delay: 1_000,
  attempts: 4,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
} as const;

/** A stored notification: realtime + badge always, push when `push`
 * (first row of an aggregate, a push type). Jobs queued before file 05
 * carry only notificationId (push = true). */
export interface NotificationJobData {
  kind?: 'notification';
  notificationId: string;
  push?: boolean;
  /** Re-queued after quiet hours: don't hold it back again. */
  deferred?: boolean;
}

/** docs/05 §8.4 `new_message`: push-only, never a notification row. */
export interface MessageJobData {
  kind: 'message';
  recipientId: string;
  conversationId: string;
  messageId: string;
  deferred?: boolean;
}

/** OQ-041: ring the callee's devices (push-only, never stored). */
export interface CallJobData {
  kind: 'call';
  recipientId: string;
  callId: string;
  deferred?: boolean;
}

export type PushJobData = NotificationJobData | MessageJobData | CallJobData;

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  /** Identifiers + deep-link data only (docs/05 §9.5). */
  data: Record<string, string>;
  /** iOS app icon number = badge total (docs/05 §10). */
  badge?: number;
  /** OQ-041: an incoming call — Android gets a data-only high-priority
   * message (the app shows the full-screen ringing UI itself); iOS a
   * time-sensitive alert. */
  call?: boolean;
}

/** Delivery to the user's devices (FCM when configured, else a log).
 * [dedupeKey] names the logical push: a retry never re-sends to a device
 * that already got it. */
export interface PushSender {
  send(message: PushMessage, dedupeKey: string): Promise<void>;
}
