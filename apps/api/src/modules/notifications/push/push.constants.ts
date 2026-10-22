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
  // Owner 2026-10-07: reposts are like likes (list only).
  'post_repost',
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
  /** Owner 2026-10-20: a group chat message (conversationId = the group). */
  groupId?: string;
  deferred?: boolean;
  /** Owner 2026-10-20: a reaction to / an edit of an existing message
   * (grouped under the message instead of a new alert each time). */
  event?: 'reaction' | 'edit';
  actorId?: string;
  emoji?: string;
}

/** OQ-041: ring the callee's devices (push-only, never stored). */
export interface CallJobData {
  kind: 'call';
  recipientId: string;
  callId: string;
  deferred?: boolean;
}

/** Push 2026-10-19: the call stopped ringing (hung up, missed, declined
 * or answered on another device) — phones still showing the system call
 * screen (app asleep / closed, no socket) take it down. */
export interface CallEndJobData {
  kind: 'call_end';
  recipientId: string;
  callId: string;
  /** The ANSWERED call is over (not just the ringing): its own job and
   * dedupe key, so the answer's "stop ringing" push does not swallow it. */
  ended?: boolean;
  deferred?: boolean;
}

export type PushJobData =
  NotificationJobData | MessageJobData | CallJobData | CallEndJobData;

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
  /** Push 2026-10-19: a silent data-only "stop ringing" for [data.callId]
   * (no alert on any platform). */
  callEnd?: boolean;
  /** `message` for chats, `notification` for everything else (calls ring
   * on their own). Owner 2026-10-07: both play the phone's own default
   * sound — LawBid ships no sounds of its own. */
  sound?: PushSoundKind;
  /** Owner 2026-10-20: a planner reminder. iOS gets it time-sensitive
   * (breaks through Focus); an Android device that keeps its own local
   * copy of the reminder gets a data-only message the app shows under the
   * same id as its alarm (never twice); other devices a normal alert
   * grouped per task (`data.taskId`). */
  reminder?: boolean;
  /** Owner 2026-10-17: FCM tokens not to send to (iPhones already rung by
   * a VoIP push — no double ring). */
  skipTokens?: string[];
  /** Owner 2026-10-20: notifications sharing a key replace each other on the
   * phone (Android tag + collapse key, iOS collapse id + thread id) — one
   * alert per message however many reactions or edits follow. */
  collapseKey?: string;
  /** Owner 2026-10-21: the alert is worth nothing after this many seconds
   * (a call from a group chat: about a minute) — the push service drops it. */
  ttlSec?: number;
  /** Owner 2026-10-22 (WhatsApp): a chat message whose `data` carries the
   * sender, their photo and the text (chat-push.ts). An Android app that
   * draws chat notifications itself (`push_tokens.chat_style`) gets it
   * data-only and shows a MessagingStyle notification per chat; every
   * other device gets the normal alert. */
  chat?: boolean;
  /** Owner 2026-10-22: the iPhone's notification stack (`thread-id`) — one
   * per chat, so a chat's messages are grouped like WhatsApp. Defaults to
   * [collapseKey]. */
  threadId?: string;
}

export type PushSoundKind = 'message' | 'notification';

/** Android channel ids (created in MainActivity.kt) and the sound per kind:
 * the phone's default notification sound on both platforms. */
export const PUSH_SOUNDS: Record<
  PushSoundKind,
  { channelId: string; android: string; ios: string }
> = {
  message: {
    channelId: 'chats',
    android: 'default',
    ios: 'default',
  },
  notification: {
    channelId: 'general',
    android: 'default',
    ios: 'default',
  },
};

/** Delivery to the user's devices (FCM when configured, else a log).
 * [dedupeKey] names the logical push: a retry never re-sends to a device
 * that already got it. */
export interface PushSender {
  send(message: PushMessage, dedupeKey: string): Promise<void>;
}
