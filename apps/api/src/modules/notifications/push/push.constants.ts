import type { NotificationType } from '@prisma/client';

/** docs/06 §6: BullMQ queue `push`. */
export const PUSH_QUEUE = 'push';
export const PUSH_JOB = 'push.send';
export const PUSH_MODULE_OPTIONS = Symbol('PUSH_MODULE_OPTIONS');
export const PUSH_SENDER = Symbol('PUSH_SENDER');

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

export interface PushJobData {
  notificationId: string;
}

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  /** Identifiers + deep-link data only (docs/05 §9.5). */
  data: Record<string, string>;
}

/** Delivery seam: FCM/APNs arrive with docs/05 (push_tokens, quiet
 * hours, UNREGISTERED cleanup). */
export interface PushSender {
  send(message: PushMessage): Promise<void>;
}
