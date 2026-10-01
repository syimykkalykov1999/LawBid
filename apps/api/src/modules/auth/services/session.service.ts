import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Session } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { TokenService } from './token.service';
import { SessionRevocationService } from './session-revocation.service';
import { AuthEventService, AUTH_EVENT_TYPES } from './auth-event.service';
import { RateLimitService } from './rate-limit.service';

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
}

export type RefreshOutcome =
  | { status: 'ok'; session: Session; refreshTokenRaw: string }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'signed_in_elsewhere' }
  | { status: 'reuse_detected'; sessionChainId: string }
  | { status: 'blocked'; reason: 'suspended' | 'deleted' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

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
  ) {}

  async createSession(
    userId: string,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<{ session: Session; refreshTokenRaw: string }> {
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
    const ended = await this.revocation.revokeSameKindChains(
      userId,
      web,
      'signed_in_elsewhere',
    );
    if (ended.length > 0 && !web) {
      await this.prisma.pushToken.deleteMany({
        where: {
          user_id: userId,
          session: { session_chain_id: { in: ended } },
        },
      });
    }

    const session = await this.prisma.session.create({
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
        expires_at: this.tokenService.refreshExpiryDate(),
      },
    });

    return { session, refreshTokenRaw: raw };
  }

  /** True if this is the first session ever created for this user on this
   * device_id — used for the (stubbed, no-op-notification) new-device
   * signal in docs/01_FOUNDATION_AUTH.md §10.6. */
  async isNewDevice(
    userId: string,
    deviceId: string | undefined,
  ): Promise<boolean> {
    if (!deviceId) return false;
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
      include: { user: { select: { status: true } } },
    });

    if (!found) {
      return { status: 'invalid' };
    }

    if (found.revoked_at !== null) {
      if (found.revoked_reason === 'rotated') {
        const withinGrace = await this.isBenignRetry(found, device);
        if (withinGrace) {
          // docs/CHANGELOG.md stage 1.4 (ask-item A6): a client retrying
          // after a network timeout that actually reached the server
          // looks identical to a stolen-token replay at the DB level.
          // Treat a same-device retry inside the grace window as benign:
          // reject without nuking the chain, so the user just has to
          // retry/re-login instead of losing every other device's session.
          return { status: 'invalid' };
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

    // docs/01 §10.3: a suspended/deleted account gets ACCOUNT_SUSPENDED/
    // ACCOUNT_DELETED on every way in — refresh included. Blocking or
    // deleting normally revokes every chain already
    // (SessionRevocationService), but a status set any other way (support
    // tooling, a direct DB fix, a half-failed admin action) must not
    // leave a 60-day refresh token working. The chain is revoked so the
    // access token dies too (blacklist), not just the refresh.
    const status = found.user.status;
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
    const session = await withTxRetry(this.prisma, async (tx) => {
      const newSession = await tx.session.create({
        data: {
          user_id: found.user_id,
          session_chain_id: found.session_chain_id,
          device_id: device.deviceId ?? found.device_id,
          device_name: device.deviceName ?? found.device_name,
          platform: device.platform ?? found.platform,
          app_version: device.appVersion ?? found.app_version,
          ip: meta.ip ?? found.ip,
          user_agent: meta.userAgent ?? found.user_agent,
          refresh_hash: newHash,
          last_used_at: new Date(),
          expires_at: this.tokenService.refreshExpiryDate(),
        },
      });
      await tx.session.update({
        where: { id: found.id },
        data: {
          revoked_at: new Date(),
          revoked_reason: 'rotated',
          replaced_by_session_id: newSession.id,
        },
      });
      await this.authEvents.record(
        {
          userId: found.user_id,
          eventType: AUTH_EVENT_TYPES.TOKEN_REFRESHED,
          success: true,
          deviceId: device.deviceId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
      return newSession;
    });

    return { status: 'ok', session, refreshTokenRaw: raw };
  }

  async listActiveChains(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { user_id: userId, revoked_at: null },
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

  /** docs/CHANGELOG.md stage 1.4 (ask-item A6, mitigation b): a rotation
   * replay within REFRESH_ROTATION_GRACE_SECONDS of the old row's
   * revocation, from the same device_id, is far more likely a client
   * retry racing a timeout than a stolen token — a real thief doesn't
   * know the rotated-away token's replacement device_id. */
  private async isBenignRetry(
    revokedRow: Session,
    device: DeviceInfo,
  ): Promise<boolean> {
    if (!revokedRow.replaced_by_session_id || !device.deviceId) return false;
    const graceMs = this.gracePeriodMs();
    const revokedAt = revokedRow.updated_at.getTime();
    if (Date.now() - revokedAt > graceMs) return false;

    const replacement = await this.prisma.session.findUnique({
      where: { id: revokedRow.replaced_by_session_id },
      select: { device_id: true },
    });
    return replacement?.device_id === device.deviceId;
  }

  private gracePeriodMs(): number {
    return (
      this.config.getOrThrow<number>('REFRESH_ROTATION_GRACE_SECONDS') * 1000
    );
  }
}
