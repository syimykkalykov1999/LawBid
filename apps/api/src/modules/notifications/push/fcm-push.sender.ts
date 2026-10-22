import { CircuitBreaker } from '../../../common/resilience/resilience';
import { Inject, Injectable } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import {
  PUSH_SOUNDS,
  type PushMessage,
  type PushSender,
} from './push.constants';
import { PushTokensService } from './push-tokens.service';

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
    for (const device of devices) {
      if (skip.has(device)) continue;
      if (key && armed.get(device)?.has(key)) continue;
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
      if (claimed === null) continue;
      let res: Response;
      try {
        res = await fetch(this.url, {
          method: 'POST',
          signal: AbortSignal.timeout(FCM_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${access}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
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
                                            PUSH_SOUNDS[message.sound]
                                              .channelId,
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
                            'apns-collapse-id': message.collapseKey.slice(
                              0,
                              64,
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
          }),
        });
      } catch (error) {
        // Network / timeout: release the claim so the retry sends.
        await this.redis.del(`${sentKey}:${device}`);
        temporary++;
        this.logger.warn(
          {
            userId: message.userId,
            err: error instanceof Error ? error.message : error,
          },
          'fcm send failed',
        );
        continue;
      }
      if (res.ok) continue;
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
        continue;
      }
      await this.redis.del(`${sentKey}:${device}`);
      temporary++;
      this.logger.warn(
        { userId: message.userId, status: res.status, code },
        'fcm send failed',
      );
    }
    if (temporary > 0) {
      throw new FcmTemporaryError(`${temporary} device(s) failed`);
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
  ) {}

  async send(message: PushMessage, dedupeKey: string): Promise<void> {
    const c = await this.secrets.get('fcm');
    const f = c?.fields ?? {};
    if (!c || !f.projectId || !f.clientEmail || !f.privateKey) {
      return this.fallback.send(message, dedupeKey);
    }
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
        ),
      };
    }
    // Owner 2026-10-15: while FCM keeps failing the sender pauses a minute
    // (the push queue retries later) instead of piling up slow calls.
    const sender = this.cached.sender;
    return fcmBreaker.run(
      () => sender.send(message, dedupeKey),
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
