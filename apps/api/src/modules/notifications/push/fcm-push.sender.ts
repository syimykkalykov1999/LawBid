import { Inject, Injectable } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import type { PushMessage, PushSender } from './push.constants';
import { PushTokensService } from './push-tokens.service';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
/** Devices already served for a logical push, kept for the retry window. */
const SENT_TTL_SEC = 24 * 3600;
const FCM_TIMEOUT_MS = 10_000;

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
import { SecretsService } from '../../../common/secrets/secrets.service';
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
      key: creds.privateKey.replace(/\\n/g, '\n'),
      scopes: [SCOPE],
    });
  }

  async send(message: PushMessage, dedupeKey: string): Promise<void> {
    const devices = await this.tokens.activeTokens(message.userId);
    if (devices.length === 0) return;
    const sentKey = `push:sent:${dedupeKey}`;
    const { token: access } = await this.jwt.getAccessToken();
    let temporary = 0;
    for (const device of devices) {
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
            message: {
              token: device,
              // OQ-041: Android rings from a data-only message (the app
              // draws the full-screen call UI); iOS gets a time-sensitive
              // alert.
              ...(message.call
                ? {}
                : {
                    notification: { title: message.title, body: message.body },
                  }),
              data: message.call
                ? { ...message.data, title: message.title, body: message.body }
                : message.data,
              android: message.call
                ? { priority: 'high', ttl: '45s' }
                : { priority: 'high' },
              apns: {
                ...(message.call ? { headers: { 'apns-priority': '10' } } : {}),
                payload: {
                  aps: {
                    // Owner 2026-10-02: a call the user switched off in
                    // Settings arrives without sound (data.silent = '1').
                    ...(message.call && message.data?.silent === '1'
                      ? {}
                      : { sound: 'default' }),
                    ...(message.call
                      ? {
                          alert: { title: message.title, body: message.body },
                          'interruption-level':
                            message.data?.silent === '1'
                              ? 'active'
                              : 'time-sensitive',
                        }
                      : {}),
                    ...(message.badge !== undefined
                      ? { badge: message.badge }
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
    return this.cached.sender.send(message, dedupeKey);
  }
}
