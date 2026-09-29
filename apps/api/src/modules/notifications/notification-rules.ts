import type { NotificationCategory, NotificationType } from '@prisma/client';

/** docs/05 §9.4: one row per recipient, object and hour. */
export const AGGREGATED_TYPES: ReadonlySet<NotificationType> = new Set([
  'post_like',
  'comment_like',
  'new_follower',
]);
export const AGGREGATION_WINDOW_MS = 60 * 60 * 1000;

/** `dedupe_key` of an aggregated notification, or null. */
export function dedupeKeyFor(
  type: NotificationType,
  payload: Record<string, unknown>,
  now: Date,
): string | null {
  if (!AGGREGATED_TYPES.has(type)) return null;
  const object =
    type === 'post_like'
      ? payload.postId
      : type === 'comment_like'
        ? payload.commentId
        : 'followers';
  if (typeof object !== 'string') return null;
  const window = Math.floor(now.getTime() / AGGREGATION_WINDOW_MS);
  return `${type}:${object}:${window}`;
}

/** §9.5: push and email of `system` can't be turned off. */
export const LOCKED_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  'system',
]);

/** §9.5 defaults when the user never changed a category (marketing stays
 * off until the marketing_push consent). */
export const DEFAULT_PUSH: Record<NotificationCategory, boolean> = {
  messages: true,
  bids: true,
  cases: true,
  social: true,
  system: true,
  marketing: false,
};

/** §9.5 "Email: только для категории system". security_new_device is
 * already mailed by the auth new-device channel (docs/01 §10.6). */
export const EMAIL_TYPES: ReadonlySet<NotificationType> = new Set([
  'verification_update',
  'subscription_trial_ending',
  'subscription_payment_failed',
  'subscription_status',
  'moderation_notice',
]);

/** §9.5: pushes that ignore quiet hours. */
export const QUIET_EXEMPT: ReadonlySet<NotificationType> = new Set([
  'security_new_device',
]);

export interface QuietHours {
  start_time: Date;
  end_time: Date;
  timezone: string;
}

/** Minutes since local midnight of [now] in [timeZone]. */
function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** When the quiet hours covering [now] end, or null outside them (a
 * window may cross midnight, e.g. 22:00–07:00). */
export function quietHoursEnd(now: Date, qh: QuietHours): Date | null {
  const start =
    qh.start_time.getUTCHours() * 60 + qh.start_time.getUTCMinutes();
  const end = qh.end_time.getUTCHours() * 60 + qh.end_time.getUTCMinutes();
  if (start === end) return null;
  let local: number;
  try {
    local = localMinutes(now, qh.timezone);
  } catch {
    return null; // unknown time zone: never hold pushes back
  }
  const inside =
    start < end ? local >= start && local < end : local >= start || local < end;
  if (!inside) return null;
  const minutesLeft = (end - local + 24 * 60) % (24 * 60);
  const at = new Date(now.getTime() + minutesLeft * 60 * 1000);
  at.setUTCSeconds(0, 0);
  return at;
}
