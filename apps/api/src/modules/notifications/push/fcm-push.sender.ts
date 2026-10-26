import { SloMetricsService } from '../../../common/ops/slo-metrics.service';
import { CircuitBreaker } from '../../../common/resilience/resilience';
import { Inject, Injectable } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import {
  NO_BADGE_CHANNEL_SUFFIX,
  PUSH_SOUNDS,
  type PushMessage,
  type PushSender,
} from './push.constants';
import { apnsCollapseId } from './chat-push';
import { PushTokensService } from './push-tokens.service';
import {
  fcmDispatcher,
  isStaleSocketError,
} from '../../../common/http/outbound-agent';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
/** Devices already served for a logical push, kept for the retry window. */
const SENT_TTL_SEC = 24 * 3600;
const FCM_TIMEOUT_MS = 10_000;
/** A ring is useless once the call stopped ringing (the app gives up at 60 s, the server at 65 s). */
const CALL_TTL_SEC = 60;
/** A planner reminder still matters for a while after its time. */
const REMINDER_TTL_SEC = 6 * 3600;

/** `<taskId>@<remindAt ms>` of a reminder push (what an iPhone reports as
 * armed); null for anything else. */
function reminderKey(data: Record<string, string> | undefined): string | null {
  const at = data?.remindAt ? Date.parse(data.remindAt) : NaN;
  return data?.taskId && !Number.isNaN(at) ? `${data.taskId}@${at}` : null;
}

/** A temporary FCM failure: BullMQ retries the job (§9.5: 3 attempts,
 * exponential backoff). */
export class FcmTemporaryError extends Error {}

/** FCM answered 429 (quota / too many requests). Carries how long FCM asked
 * us to wait; the push worker turns it into ONE queue-wide pause (S10-5)
 * instead of every job retrying into the same limit. */
export class FcmRateLimitError extends FcmTemporaryError {
  constructor(readonly retryAfterMs: number) {
    super(`FCM rate limited, retry after ${retryAfterMs} ms`);
  }
}

/** Retry-After header (seconds or an HTTP date) → ms, bounded 1 s … 5 min;
 * 60 s when FCM sent none (Google's guidance: back off at least a minute). */
export function retryAfterMs(header: string | null | undefined): number {
  const raw = header?.trim();
  let ms = 60_000;
  if (raw) {
    const secs = Number(raw);
    if (Number.isFinite(secs)) ms = secs * 1000;
    else {
      const at = Date.parse(raw);
      if (!Number.isNaN(at)) ms = at - Date.now();
    }
  }
  return Math.min(300_000, Math.max(1_000, ms));
}

/** Owner 2026-10-22: FCM's multicast size (sendEachForMulticast takes at
 * most 500 tokens) — the most device requests in flight at once. */
export const FCM_MULTICAST_MAX = 500;
/** Recipients sent together by [FcmPushSender.sendMany]: each has at most
 * 10 devices (push-tokens MAX_DEVICES), so ≤ FCM_MULTICAST_MAX requests. */
export const FCM_USERS_PER_BATCH = 50;

/** Runs [fn] over [items], [size] at a time (each chunk in parallel). */
export async function inChunks<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/**
 * docs/05 §9.5 push over FCM HTTP v1 (service account from FCM_* env,
 * OAuth token via google-auth-library, cached by it until expiry). Every
 * device is sent to once per logical push — a retry skips devices that
 * already got it, so a partial failure never duplicates on the others.
 * UNREGISTERED / invalid tokens are deleted. Logs ids only.
 */
import { normalizePem } from '../../../common/secrets/provider-registry';
import { SecretsService } from '../../../common/secrets/secrets.service';
/** One per process: five temporary FCM failures in a row pause it a minute. */
const fcmBreaker = new CircuitBreaker('fcm', { threshold: 5, openMs: 60_000 });

@Injectable()
export class FcmPushSender implements PushSender {
  private readonly jwt: JWT;
  private readonly url: string;

  constructor(
    creds: { projectId: string; clientEmail: string; privateKey: string },
    private readonly tokens: PushTokensService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    // Owner 2026-10-22 (audit #4 §7): push failure SLO.
    private readonly slo?: SloMetricsService,
  ) {
    this.logger.setContext(FcmPushSender.name);
    this.url = `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`;
    this.jwt = new JWT({
      email: creds.clientEmail,
      // Any paste shape: real breaks, literal \\n, or one line.
      key: normalizePem(creds.privateKey),
      scopes: [SCOPE],
    });
  }

  async send(message: PushMessage, dedupeKey: string): Promise<void> {
    const devices = await this.tokens.activeTokens(message.userId);
    if (devices.length === 0) return;
    const sentKey = `push:sent:${dedupeKey}`;
    const { token: access } = await this.jwt.getAccessToken();
    let temporary = 0;
    let rateLimitMs = 0;
    const skip = new Set(message.skipTokens ?? []);
    if (message.callEnd) {
      for (const t of await this.tokens.webTokens(message.userId)) skip.add(t);
    }
    // Owner 2026-10-20: devices whose app shows the reminder itself.
    const localReminder = new Set(
      message.reminder
        ? await this.tokens.localReminderTokens(message.userId)
        : [],
    );
    // Owner 2026-10-20: an iPhone that armed this very reminder as a local
    // alarm does not get the push too (one banner, not two).
    const armed = message.reminder
      ? await this.tokens.armedReminders(message.userId)
      : new Map<string, Set<string>>();
    const key = reminderKey(message.data);
    // Owner 2026-10-22: Android apps that draw the chat notification
    // themselves (sender's photo, one stack per chat).
    const chatStyle = new Set(
      message.chat ? await this.tokens.chatStyleTokens(message.userId) : [],
    );
    // Owner 2026-10-22 (server load audit, finding 7): the devices go out
    // in parallel, at most FCM_MULTICAST_MAX at a time — what the Admin
    // SDK's sendEachForMulticast does (one HTTP v1 call per token; FCM
    // retired the batch endpoint). It used to be one device after another.
    const one = async (device: string): Promise<void> => {
      if (skip.has(device)) return;
      if (key && armed.get(device)?.has(key)) return;
      const ownChat = chatStyle.has(device);
      const dataOnly = message.call || localReminder.has(device) || ownChat;
      // Claim the device before the call: a crash between FCM's 200 and
      // the mark can at most skip a push, never double it (load review).
      const claimed = await this.redis.set(
        `${sentKey}:${device}`,
        '1',
        'EX',
        SENT_TTL_SEC,
        'NX',
      );
      if (claimed === null) return;
      let res: Response;
      try {
        const body = JSON.stringify({
          message: message.callEnd
            ? callEndMessage(device, message)
            : {
                token: device,
                // OQ-041: Android rings from a data-only message (the app
                // draws the full-screen call UI); iOS gets a time-sensitive
                // alert.
                ...(dataOnly
                  ? {}
                  : {
                      notification: {
                        title: message.title,
                        body: message.body,
                      },
                    }),
                data: dataOnly
                  ? {
                      ...message.data,
                      title: message.title,
                      body: message.body,
                      // Owner 2026-10-22 (inbox 29): the app draws this
                      // chat alert itself — «Счётчик на иконке» off makes
                      // it use the channel without a launcher badge.
                      ...(ownChat && message.iconBadge === false
                        ? { iconBadge: '0' }
                        : {}),
                    }
                  : message.data,
                android: message.call
                  ? { priority: 'high', ttl: `${CALL_TTL_SEC}s` }
                  : ownChat
                    ? { priority: 'high' }
                    : dataOnly
                      ? { priority: 'high', ttl: `${REMINDER_TTL_SEC}s` }
                      : {
                          priority: 'high',
                          ...(message.ttlSec
                            ? { ttl: `${message.ttlSec}s` }
                            : {}),
                          ...(message.collapseKey
                            ? { collapse_key: message.collapseKey }
                            : {}),
                          ...(message.sound || message.reminder
                            ? {
                                notification: {
                                  ...(message.sound
                                    ? {
                                        channel_id:
                                          PUSH_SOUNDS[message.sound].channelId +
                                          (message.iconBadge === false
                                            ? NO_BADGE_CHANNEL_SUFFIX
                                            : ''),
                                        sound:
                                          PUSH_SOUNDS[message.sound].android,
                                      }
                                    : {}),
                                  // One notification per task / per message
                                  // thread: a repeat replaces it.
                                  ...(message.collapseKey
                                    ? { tag: message.collapseKey }
                                    : message.reminder && message.data?.taskId
                                      ? { tag: `task:${message.data.taskId}` }
                                      : {}),
                                },
                              }
                            : {}),
                        },
                apns: {
                  // Push 2026-10-19: delivered at once (screen off / Low Power
                  // mode too) as a visible alert; a call is useless after it
                  // stops ringing, so it expires with the ring.
                  headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert',
                    // A visible reminder / a reaction replaces the earlier
                    // one of the same task or message (a repeat, a retry).
                    ...(message.collapseKey
                      ? {
                          'apns-collapse-id': apnsCollapseId(
                            message.collapseKey,
                          ),
                        }
                      : message.reminder && message.data?.taskId
                        ? {
                            'apns-collapse-id': `task:${message.data.taskId}`,
                          }
                        : {}),
                    ...(message.call || message.ttlSec
                      ? {
                          'apns-expiration': String(
                            Math.floor(Date.now() / 1000) +
                              (message.ttlSec ?? CALL_TTL_SEC),
                          ),
                        }
                      : {}),
                  },
                  payload: {
                    aps: {
                      // Owner 2026-10-02: a call the user switched off in
                      // Settings arrives without sound (data.silent = '1').
                      ...(message.call && message.data?.silent === '1'
                        ? {}
                        : {
                            sound: message.sound
                              ? PUSH_SOUNDS[message.sound].ios
                              : 'default',
                          }),
                      ...(message.call
                        ? {
                            alert: {
                              title: message.title,
                              body: message.body,
                            },
                            'interruption-level':
                              message.data?.silent === '1'
                                ? 'active'
                                : 'time-sensitive',
                          }
                        : message.reminder
                          ? // Owner 2026-10-20: a planner reminder breaks
                            // through Focus like a calendar alert.
                            {
                              'interruption-level': 'time-sensitive',
                              'thread-id': 'task-reminders',
                            }
                          : {}),
                      ...(message.badge !== undefined
                        ? { badge: message.badge }
                        : {}),
                      // Lets a notification service extension (if one is
                      // added) enrich the alert; ignored without one.
                      'mutable-content': 1,
                      ...(message.threadId || message.collapseKey
                        ? {
                            'thread-id':
                              message.threadId ?? message.collapseKey,
                          }
                        : {}),
                    },
                  },
                },
              },
        });
        // S8-3: FCM rides one HTTP/2 connection (undici allowH2); a session
        // the peer closed while idle dies on first use - repeat once.
        const send = (): Promise<Response> =>
          fetch(this.url, {
            method: 'POST',
            signal: AbortSignal.timeout(FCM_TIMEOUT_MS),
            headers: {
              Authorization: `Bearer ${access}`,
              'Content-Type': 'application/json',
            },
            body,
            ...({ dispatcher: fcmDispatcher() } as object),
          });
        try {
          res = await send();
        } catch (first) {
          if (!isStaleSocketError(first)) throw first;
          res = await send();
        }
      } catch (error) {
        // Network / timeout: release the claim so the retry sends.
        await this.redis.del(`${sentKey}:${device}`);
        temporary++;
        this.slo?.count('pushFailed');
        this.logger.warn(
          {
            userId: message.userId,
            err: error instanceof Error ? error.message : error,
          },
          'fcm send failed',
        );
        return;
      }
      if (res.ok) {
        this.slo?.count('pushOk');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: { status?: string; details?: { errorCode?: string }[] };
      };
      const code =
        body.error?.details?.find((d) => d.errorCode)?.errorCode ??
        body.error?.status;
      // Only a token the platform no longer knows is dropped; a wrong
      // project id (404 for everyone) or a bad payload must not erase
      // every user's tokens (security review).
      if (code === 'UNREGISTERED') {
        await this.tokens.remove(device);
        return;
      }
      await this.redis.del(`${sentKey}:${device}`);
      temporary++;
      if (res.status === 429) {
        rateLimitMs = Math.max(
          rateLimitMs,
          retryAfterMs(res.headers?.get?.('retry-after')),
        );
      }
      this.slo?.count('pushFailed');
      this.logger.warn(
        { userId: message.userId, status: res.status, code },
        'fcm send failed',
      );
    };
    await inChunks(devices, FCM_MULTICAST_MAX, one);
    if (rateLimitMs > 0) throw new FcmRateLimitError(rateLimitMs);
    if (temporary > 0) {
      throw new FcmTemporaryError(`${temporary} device(s) failed`);
    }
  }

  /**
   * Owner 2026-10-22 (server load audit, finding 7): one logical push to
   * many people (a group message) — FCM_USERS_PER_BATCH recipients at a
   * time, their devices in parallel. A temporary failure of some is
   * reported once at the end (the retry skips everyone already served).
   */
  async sendMany(messages: PushMessage[], dedupeKey: string): Promise<void> {
    let temporary = 0;
    let limited: FcmRateLimitError | undefined;
    for (let i = 0; i < messages.length; i += FCM_USERS_PER_BATCH) {
      const results = await Promise.allSettled(
        messages
          .slice(i, i + FCM_USERS_PER_BATCH)
          .map((m) => this.send(m, dedupeKey)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') continue;
        if (r.reason instanceof FcmRateLimitError) limited = r.reason;
        if (r.reason instanceof FcmTemporaryError) temporary++;
        else throw r.reason;
      }
    }
    if (limited) throw limited;
    if (temporary > 0) {
      throw new FcmTemporaryError(`${temporary} recipient(s) failed`);
    }
  }
}

/**
 * Owner 2026-10-01: the FCM service account can be changed in the admin
 * (Integrations). Each send uses the current keys (the sender is rebuilt
 * only when they changed); without keys pushes are only logged.
 */
export class DynamicPushSender implements PushSender {
  private cached?: { fingerprint: string; sender: FcmPushSender };

  constructor(
    private readonly secrets: SecretsService,
    private readonly tokens: PushTokensService,
    private readonly redis: Redis,
    private readonly logger: PinoLogger,
    private readonly fallback: PushSender,
    private readonly slo?: SloMetricsService,
  ) {}

  async send(message: PushMessage, dedupeKey: string): Promise<void> {
    const sender = await this.current();
    if (!sender) return this.fallback.send(message, dedupeKey);
    // Owner 2026-10-15: while FCM keeps failing the sender pauses a minute
    // (the push queue retries later) instead of piling up slow calls.
    return fcmBreaker.run(
      () => sender.send(message, dedupeKey),
      (e) => e instanceof FcmTemporaryError,
    );
  }

  /** The FCM sender for the current keys (rebuilt only when they
   * changed), or null without keys. */
  private async current(): Promise<FcmPushSender | null> {
    const c = await this.secrets.get('fcm');
    const f = c?.fields ?? {};
    if (!c || !f.projectId || !f.clientEmail || !f.privateKey) return null;
    if (this.cached?.fingerprint !== c.fingerprint) {
      this.cached = {
        fingerprint: c.fingerprint,
        sender: new FcmPushSender(
          {
            projectId: f.projectId,
            clientEmail: f.clientEmail,
            privateKey: f.privateKey,
          },
          this.tokens,
          this.redis,
          this.logger,
          this.slo,
        ),
      };
    }
    return this.cached.sender;
  }

  /** Owner 2026-10-22: many recipients of one logical push (FcmPushSender
   * .sendMany); without FCM keys each goes to the fallback. */
  async sendMany(messages: PushMessage[], dedupeKey: string): Promise<void> {
    const sender = await this.current();
    if (!sender) {
      for (const m of messages) await this.fallback.send(m, dedupeKey);
      return;
    }
    return fcmBreaker.run(
      () => sender.sendMany(messages, dedupeKey),
      (e) => e instanceof FcmTemporaryError,
    );
  }
}

/** Push 2026-10-19: "stop ringing" — data-only on both platforms: Android
 * wakes the background handler (high priority, short ttl), iOS gets a
 * silent background push (content-available, which Apple requires to be
 * priority 5). Nothing is shown. */
function callEndMessage(device: string, message: PushMessage) {
  return {
    token: device,
    data: message.data,
    android: { priority: 'high', ttl: `${CALL_TTL_SEC}s` },
    apns: {
      headers: {
        'apns-priority': '5',
        'apns-push-type': 'background',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + CALL_TTL_SEC),
      },
      payload: { aps: { 'content-available': 1 } },
    },
  };
}
