import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type Redis from 'ioredis';
import type { SessionRow } from '../../../prisma/secret-columns';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { TokenService } from './token.service';
import { SessionRevocationService } from './session-revocation.service';
import { AuthEventService, AUTH_EVENT_TYPES } from './auth-event.service';
import { RateLimitService } from './rate-limit.service';
import { AccountBansService } from '../../account-bans/account-bans.service';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';

/** STAGE2_SECURITY #13: default of `auth.session_absolute_days`. */
export const DEFAULT_SESSION_ABSOLUTE_DAYS = 365;
const DAY_MS = 86_400_000;

export interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  /** X-Device-Id header (client-generated, unauthenticated — only used
   * as a rate-limit key, never trusted for anything else). */
  deviceId?: string;
  /** X-Device-Key (owner 2026-10-05, docs/CLIENT_FRAUD.md): Android ID /
   * an iOS Keychain id that survives reinstalling the app. Only hashed,
   * only to recognise a blocked fraudster's phone. */
  deviceKey?: string;
  /** Country of the caller as the CDN / load balancer reports it (ISO-3166
   * alpha-2; request-country.util.ts). Undefined when not reported. */
  country?: string;
  /** X-App-Version as the app sends it (R2B-9: rules switched on per app
   * version). Untrusted, never a reason to grant more than today. */
  appVersion?: string;
}

/** Retry-After of a refresh answered 503 (Redis down, lost rotation race). */
const BUSY_RETRY_SECONDS = 2;

export type RefreshOutcome =
  | { status: 'ok'; session: SessionRow; refreshTokenRaw: string }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'signed_in_elsewhere' }
  | { status: 'reuse_detected'; sessionChainId: string }
  | { status: 'blocked'; reason: 'suspended' | 'deleted' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  // The token may be fine but we cannot tell right now (Redis down, a lost
  // rotation race whose winner has not cached its pair yet): the caller
  // answers 503 + Retry-After, which the app treats as «try again», never as
  // «signed out» (review R-64).
  | { status: 'busy'; retryAfterSeconds: number };

/**
 * Owns the `Session` row lifecycle: creating a new chain at login, rotating
 * it on refresh, listing/ending chains. Reuse-detection mechanism
 * (docs/CHANGELOG.md, stage 1.4): a hash lookup that hits an ALREADY
 * revoked row with revoked_reason='rotated' IS the detection — the chain
 * doesn't need to be walked to detect reuse, only to decide the blast
 * radius of revoking it (handled by SessionRevocationService via
 * session_chain_id, O(1) regardless of chain length).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly revocation: SessionRevocationService,
    private readonly authEvents: AuthEventService,
    private readonly config: ConfigService,
    private readonly rateLimit: RateLimitService,
    // S14-3: the 10 s replay cache of a just-rotated refresh token.
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    // Verify batch 7 (BA1): phone / e-mail / device bans on refresh.
    @Optional() private readonly bans?: AccountBansService,
    // STAGE2_SECURITY #13: auth.session_absolute_days.
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  private readonly logger = new Logger(SessionService.name);

  /**
   * 14.11 (DB scale review, finding 8): the device's push and VoIP tokens
   * follow the chain to its new row. They pointed at the row current when
   * they registered; an app that refreshes without registering again (an
   * iPhone woken only by VoIP calls, a phone opened rarely) lost them when
   * sessions.cleanup removed that row (ON DELETE CASCADE). Now the cascade
   * fires only when the chain itself ends. Outside the rotation
   * transaction (tokens are another family) and best-effort: a refresh
   * never fails for it; the next one moves them.
   */
  private async moveDeviceTokens(
    userId: string,
    chainId: string,
    fromId: string,
    toId: string,
  ): Promise<void> {
    const move = {
      where: {
        user_id: userId,
        OR: [{ session_chain_id: chainId }, { session_id: fromId }],
      },
      data: { session_id: toId, session_chain_id: chainId },
    };
    try {
      await Promise.all([
        this.prisma.pushToken.updateMany(move),
        this.prisma.voipToken.updateMany(move),
      ]);
    } catch (err) {
      this.logger.warn(
        `device tokens not moved to the new session row: ${String(err)}`,
      );
    }
  }

  async createSession(
    userId: string,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<{ session: SessionRow; refreshTokenRaw: string }> {
    const { raw, hash } = this.tokenService.generateRefreshToken();
    const sessionChainId = randomUUID();

    // Owner 2026-10-01: one phone and one website per account at a time.
    // Signing in on a phone ends the account's other phone session (that
    // device is signed out with AUTH_SIGNED_IN_ELSEWHERE and stops getting
    // pushes); a browser sign-in ends the other browser session only. So an
    // attorney works from the phone and the computer, but can't hand the
    // account to assistants instead of buying seats, nor can several
    // assistants share one assistant account.
    const web = device.platform === 'web';
    // SE1 (17.11): two sign-ins of one account on two phones at the same
    // moment both found «no other phone» and both kept a session. Ending
    // the other same-kind sessions and creating this one now run in one
    // transaction behind a per-account, per-kind advisory lock (the
    // bids / quick-replies pattern): the second waits, then sees and ends
    // the first one's row. READ COMMITTED is enough under the lock.
    const { session, ended } = await withTxRetry(
      this.prisma,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`session-kind:${userId}:${web ? 'web' : 'app'}`}, 0))`;
        const ended = await this.revocation.revokeSameKindChains(
          userId,
          web,
          'signed_in_elsewhere',
          tx,
        );
        const session = await tx.session.create({
          data: {
            user_id: userId,
            session_chain_id: sessionChainId,
            device_id: device.deviceId,
            device_name: device.deviceName,
            platform: device.platform,
            app_version: device.appVersion,
            ip: meta.ip,
            user_agent: meta.userAgent,
            refresh_hash: hash,
            last_used_at: new Date(),
            chain_started_at: new Date(),
            expires_at: await this.chainExpiry(new Date()),
          },
        });
        return { session, ended };
      },
      { isolation: 'readCommitted', op: 'session.create' },
    );
    if (ended.length > 0 && !web) {
      await this.prisma.pushToken.deleteMany({
        where: {
          user_id: userId,
          OR: [
            { session_chain_id: { in: ended } },
            // a row of an older release: its chain through its session row
            {
              session_chain_id: null,
              session: { session_chain_id: { in: ended } },
            },
          ],
        },
      });
    }

    return { session, refreshTokenRaw: raw };
  }

  /** Owner 2026-10-01: another active session of the same kind (phone /
   * website) on a different device — the one a new sign-in would end. */
  async otherActiveDevice(userId: string, device: DeviceInfo) {
    const web = device.platform === 'web';
    return this.prisma.session.findFirst({
      where: {
        user_id: userId,
        revoked_at: null,
        expires_at: { gt: new Date() },
        ...(web ? { platform: 'web' } : { NOT: { platform: 'web' } }),
        ...(device.deviceId ? { NOT: { device_id: device.deviceId } } : {}),
      },
      orderBy: { last_used_at: 'desc' },
      select: { device_name: true, platform: true, last_used_at: true },
    });
  }

  /** True if this is the first session ever created for this user on this
   * device_id — the new-device signal of docs/01_FOUNDATION_AUTH.md §10.6.
   * S14-4: a sign-in that sends no device id at all counts as NEW (the id
   * is a client-supplied header; leaving it out must not silence the alert). */
  async isNewDevice(
    userId: string,
    deviceId: string | undefined,
  ): Promise<boolean> {
    if (!deviceId) return true;
    const existing = await this.prisma.session.findFirst({
      where: { user_id: userId, device_id: deviceId },
      select: { id: true },
    });
    return existing === null;
  }

  async rotate(
    rawRefreshToken: string,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<RefreshOutcome> {
    const hash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const found = await this.prisma.session.findUnique({
      where: { refresh_hash: hash },
      include: {
        user: { select: { status: true, phone_e164: true, email: true } },
      },
    });

    if (!found) {
      return { status: 'invalid' };
    }

    if (found.revoked_at !== null) {
      if (found.revoked_reason === 'rotated') {
        // S14-3 (RFC 9700 §4.14): a client retrying after a timeout that
        // actually reached the server presents the token we just rotated
        // away. Instead of trusting a client-supplied device id, the
        // child pair issued a moment ago is replayed from a short Redis
        // cache keyed by the old token's hash (idempotent retry); anyone
        // else replaying the old token after that is reuse.
        const replayed = await this.replay(hash);
        const insideGrace =
          Date.now() - found.updated_at.getTime() <= this.gracePeriodMs();
        if (replayed !== null && replayed !== 'unavailable') {
          return replayed;
        }
        // Redis is down (`'unavailable'`) or the cached pair is gone while
        // we are still inside the grace window: we cannot tell a retry from
        // a theft. Answer a retryable 503 (the app keeps its token on 5xx)
        // instead of a 401 that signs everyone out, and do not end the chain.
        if (insideGrace) {
          return { status: 'busy', retryAfterSeconds: BUSY_RETRY_SECONDS };
        }
        await withTxRetry(this.prisma, async (tx) => {
          await this.revocation.revokeChain(
            found.session_chain_id,
            'reuse_detected',
            tx,
          );
          await this.authEvents.record(
            {
              userId: found.user_id,
              eventType: AUTH_EVENT_TYPES.REFRESH_REUSE_DETECTED,
              success: false,
              deviceId: device.deviceId,
              ip: meta.ip,
              userAgent: meta.userAgent,
            },
            tx,
          );
        });
        return {
          status: 'reuse_detected',
          sessionChainId: found.session_chain_id,
        };
      }
      if (found.revoked_reason === 'signed_in_elsewhere') {
        return { status: 'signed_in_elsewhere' };
      }
      // Revoked for any other reason (logout, logout_all, admin_block,
      // account_deletion) — already inert, no further action needed.
      return { status: 'invalid' };
    }

    if (found.expires_at.getTime() < Date.now()) {
      return { status: 'expired' };
    }

    // STAGE2_SECURITY #13 (ASVS 5.0 V7.3.2 / V10.4.8): an absolute lifetime
    // counted from the sign-in, whatever the refreshes. Past it the chain
    // ends and the person signs in again (a passkey makes it one tap).
    const chainStartedAt =
      found.chain_started_at ?? (await this.chainStart(found));
    if (await this.pastAbsoluteLifetime(chainStartedAt)) {
      await this.revocation.revokeChain(
        found.session_chain_id,
        'session_expired',
      );
      return { status: 'expired' };
    }

    // docs/01 §10.3: a suspended/deleted account gets ACCOUNT_SUSPENDED/
    // ACCOUNT_DELETED on every way in — refresh included. Blocking or
    // deleting normally revokes every chain already
    // (SessionRevocationService), but a status set any other way (support
    // tooling, a direct DB fix, a half-failed admin action) must not
    // leave a 60-day refresh token working. The chain is revoked so the
    // access token dies too (blacklist), not just the refresh.
    // Verify batch 7 (BA1): an active ban of the account, its phone, its
    // e-mail or this device ends the chain the way a suspension does (a
    // phone / e-mail / device ban left users.status 'active').
    const banned =
      found.user.status === 'active' &&
      (await this.bans?.findActive({
        userId: found.user_id,
        phone: found.user.phone_e164,
        email: found.user.email,
        deviceId: found.device_id,
      }));
    const status = banned ? 'suspended' : found.user.status;
    if (status === 'suspended' || status === 'deleted') {
      await withTxRetry(this.prisma, async (tx) => {
        await this.revocation.revokeChain(
          found.session_chain_id,
          status === 'suspended' ? 'admin_block' : 'account_deletion',
          tx,
        );
        await this.authEvents.record(
          {
            userId: found.user_id,
            eventType:
              status === 'suspended'
                ? AUTH_EVENT_TYPES.LOGIN_BLOCKED_SUSPENDED
                : AUTH_EVENT_TYPES.LOGIN_BLOCKED_DELETED,
            success: false,
            deviceId: device.deviceId,
            ip: meta.ip,
            userAgent: meta.userAgent,
            meta: { via: 'refresh' },
          },
          tx,
        );
      });
      return { status: 'blocked', reason: status };
    }

    // Per-chain limit on top of the per-IP one (AuthService.refresh): a
    // stolen refresh token driven by a script from rotating IPs would
    // otherwise mint tokens indefinitely. Counted only for live, valid
    // tokens so reuse detection above is never rate-limited away.
    const chainLimit = await this.rateLimit.consumeFixedWindow(
      ['refresh', 'chain', found.session_chain_id],
      this.config.getOrThrow<number>('AUTH_REFRESH_LIMIT_PER_SESSION_PER_HOUR'),
      3600,
    );
    if (!chainLimit.allowed) {
      await this.authEvents.record({
        userId: found.user_id,
        eventType: AUTH_EVENT_TYPES.REFRESH_RATE_LIMITED,
        success: false,
        deviceId: device.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { sessionChainId: found.session_chain_id },
      });
      return {
        status: 'rate_limited',
        retryAfterSeconds: chainLimit.retryAfterSeconds,
      };
    }

    const { raw, hash: newHash } = this.tokenService.generateRefreshToken();
    const session = await withTxRetry(
      this.prisma,
      async (tx) => {
        // S14-3: single winner. The old row is claimed FIRST with a
        // `revoked_at: null` guard; only the request that flips it (count 1)
        // goes on to mint the child. Two parallel refreshes with the same
        // live token (a thief and the owner, two tabs) can no longer both
        // get a valid child and fork the chain.
        const claimed = await tx.session.updateMany({
          where: { id: found.id, revoked_at: null },
          data: { revoked_at: new Date(), revoked_reason: 'rotated' },
        });
        if (claimed.count !== 1) return null;
        const newSession = await tx.session.create({
          data: {
            user_id: found.user_id,
            session_chain_id: found.session_chain_id,
            // The chain keeps the device it was created on: a refresh
            // caller cannot re-label it (S14-4); only a chain that never
            // had an id takes the one sent.
            device_id: found.device_id ?? device.deviceId,
            device_name: device.deviceName ?? found.device_name,
            platform: device.platform ?? found.platform,
            app_version: device.appVersion ?? found.app_version,
            ip: meta.ip ?? found.ip,
            user_agent: meta.userAgent ?? found.user_agent,
            refresh_hash: newHash,
            last_used_at: new Date(),
            chain_started_at: chainStartedAt,
            expires_at: await this.chainExpiry(chainStartedAt),
          },
        });
        await tx.session.update({
          where: { id: found.id },
          data: { replaced_by_session_id: newSession.id },
        });
        return newSession;
        // Prod 2026-10-21: on a loaded database the default 5 s transaction
        // expired and refresh answered 500, so every request after it failed.
      },
      { timeoutMs: 15_000 },
    );

    if (!session) {
      // Lost the race: the winner is minting the child right now. Hand the
      // loser the same pair as soon as it is cached (an idempotent retry);
      // otherwise a plain refusal, which does not end the chain.
      const winner = await this.awaitReplay(hash);
      return (
        winner ?? { status: 'busy', retryAfterSeconds: BUSY_RETRY_SECONDS }
      );
    }
    await this.cacheReplay(hash, session.id, raw);
    await this.moveDeviceTokens(
      found.user_id,
      found.session_chain_id,
      found.id,
      session.id,
    );

    // The audit row is best-effort and outside the transaction: a slow
    // database must not turn a good rotation into a 500.
    await this.authEvents
      .record({
        userId: found.user_id,
        eventType: AUTH_EVENT_TYPES.TOKEN_REFRESHED,
        success: true,
        deviceId: device.deviceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      .catch(() => undefined);

    return { status: 'ok', session, refreshTokenRaw: raw };
  }

  /** The admin's absolute lifetime in days (0 = off; settings unreadable
   * → the default 365). */
  private async absoluteDays(): Promise<number> {
    try {
      const v = await this.settings?.number('auth.session_absolute_days');
      if (v !== undefined && Number.isFinite(v) && v >= 0) return Math.floor(v);
    } catch {
      // settings unreachable: keep the default
    }
    return DEFAULT_SESSION_ABSOLUTE_DAYS;
  }

  private async pastAbsoluteLifetime(startedAt: Date): Promise<boolean> {
    const days = await this.absoluteDays();
    return days > 0 && Date.now() - startedAt.getTime() > days * DAY_MS;
  }

  /** The refresh expiry, never past the chain's absolute end. */
  private async chainExpiry(startedAt: Date): Promise<Date> {
    const sliding = this.tokenService.refreshExpiryDate();
    const days = await this.absoluteDays();
    if (days <= 0) return sliding;
    const absolute = new Date(startedAt.getTime() + days * DAY_MS);
    return absolute < sliding ? absolute : sliding;
  }

  /** A chain opened before #13: its oldest row is the sign-in. */
  private async chainStart(found: SessionRow): Promise<Date> {
    const first = await this.prisma.session.findFirst({
      where: { session_chain_id: found.session_chain_id },
      orderBy: { created_at: 'asc' },
      select: { created_at: true },
    });
    return first?.created_at ?? found.created_at ?? new Date();
  }

  async listActiveChains(userId: string): Promise<SessionRow[]> {
    return this.prisma.session.findMany({
      // S14-10: a row past its expiry that was never revoked is not a live
      // session and must not be listed as one.
      where: {
        user_id: userId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      orderBy: { last_used_at: 'desc' },
    });
  }

  /** Ownership-checked: throws by returning false if the chain doesn't
   * belong to this user, so the controller can 404 rather than leaking
   * whether a session id exists for someone else's account. */
  async belongsToUser(
    sessionChainId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await this.prisma.session.findFirst({
      where: { session_chain_id: sessionChainId, user_id: userId },
      select: { id: true },
    });
    return row !== null;
  }

  // ---- S14-3: replay cache of a rotated refresh token -------------------

  private replayKey(oldHash: string): string {
    return `auth:refresh-replay:${oldHash}`;
  }

  /** AES-256-GCM key for the cached pair: derived from a server secret, so
   * a Redis dump alone does not hand out refresh tokens. */
  private replayKeyBytes(): Buffer {
    return createHash('sha256')
      .update(
        `refresh-replay:v1:${this.config.getOrThrow<string>('OTP_KEY_PEPPER')}`,
      )
      .digest();
  }

  private seal(payload: object): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.replayKeyBytes(), iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), body]
      .map((b) => b.toString('base64url'))
      .join('.');
  }

  private unseal(sealed: string): { sessionId: string; raw: string } | null {
    try {
      const [iv, tag, body] = sealed
        .split('.')
        .map((p) => Buffer.from(p, 'base64url'));
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.replayKeyBytes(),
        iv,
        // Semgrep gcm-no-tag-length (pass 2026-11-08): only the full
        // 16-byte tag; a truncated one is refused, not accepted.
        { authTagLength: 16 },
      );
      decipher.setAuthTag(tag);
      const text = Buffer.concat([
        decipher.update(body),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(text) as { sessionId: string; raw: string };
    } catch {
      return null;
    }
  }

  /** Best effort: a failed cache write only means a retry is refused. */
  private async cacheReplay(
    oldHash: string,
    sessionId: string,
    raw: string,
  ): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(
        this.replayKey(oldHash),
        this.seal({ sessionId, raw }),
        'EX',
        Math.max(1, Math.ceil(this.gracePeriodMs() / 1000)),
      );
    } catch {
      // see above
    }
  }

  /** The child pair issued for [oldHash] a moment ago; `null` = none;
   * `'unavailable'` = Redis could not be asked. */
  private async replay(
    oldHash: string,
  ): Promise<Extract<RefreshOutcome, { status: 'ok' }> | null | 'unavailable'> {
    if (!this.redis) return 'unavailable';
    let sealed: string | null;
    try {
      sealed = await this.redis.get(this.replayKey(oldHash));
    } catch {
      return 'unavailable';
    }
    if (!sealed) return null;
    const payload = this.unseal(sealed);
    if (!payload) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session || session.revoked_at !== null) return null;
    return { status: 'ok', session, refreshTokenRaw: payload.raw };
  }

  /** The loser of a rotation race waits briefly for the winner's cache. */
  private async awaitReplay(
    oldHash: string,
  ): Promise<Extract<RefreshOutcome, { status: 'ok' }> | null> {
    for (let i = 0; i < 10; i += 1) {
      const hit = await this.replay(oldHash);
      if (hit === 'unavailable') return null;
      if (hit) return hit;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  private gracePeriodMs(): number {
    return (
      this.config.getOrThrow<number>('REFRESH_ROTATION_GRACE_SECONDS') * 1000
    );
  }
}
