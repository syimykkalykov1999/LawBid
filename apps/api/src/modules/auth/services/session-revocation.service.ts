import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Prisma, PrismaClient } from '@prisma/client';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { PrismaService } from '../../../prisma/prisma.service';
import { TokenService } from './token.service';
import { publishSessionRevoked } from '../../../redis/session-revoked';
import { isRedisInfraError } from '../../../redis/redis-errors';
import { throttledWarn } from '../../../common/logging/throttled-warn';
import { L1Cache } from '../../../common/cache/l1-cache';

export type RevokeReason =
  | 'logout'
  | 'logout_all'
  | 'rotated'
  | 'reuse_detected'
  | 'admin_block'
  | 'account_deletion'
  // Owner 2026-10-01: one account, one device — a sign-in elsewhere ends
  // every other session (no sharing an attorney or assistant account).
  | 'signed_in_elsewhere'
  // Owner 2026-10-22 (security audit #3, finding 5): the phone, e-mail or
  // password changed — every other session ends, this one stays.
  | 'credentials_changed'
  // Owner 2026-10-22 (security audit #3, finding 6): the attorney (or the
  // admin) removed the assistant — their own sign-ins end too.
  | 'assistant_removed'
  // 2026-10-25 (COPPA): an admin flagged or deleted a suspected minor.
  | 'minor_flagged'
  | 'minor_deleted';

/**
 * Single choke point for every way a session can end (logout, logout-all,
 * DELETE /auth/sessions/:id, refresh-reuse detection, account deletion,
 * and later an admin block) — docs/CHANGELOG.md stage 1.4: funneling all
 * of these through one place means there's exactly one spot to forget the
 * blacklist write, instead of six.
 *
 * Blacklist key TTL only needs to outlive the longest-possibly-valid
 * access token (JWT_ACCESS_TTL_SECONDS) plus clock-skew slack — a
 * revoked-15-minutes-ago session doesn't need its blacklist entry anymore
 * because any token from it has already expired on its own. This keeps
 * the blacklist keyspace at "sessions revoked in roughly the last 16
 * minutes" rather than growing unboundedly.
 *
 * Redis writes happen AFTER the DB commit, not inside the same
 * transaction: worst case on a Redis hiccup, a revoked session's access
 * token stays valid for up to its remaining TTL (<=15 min) instead of a
 * half-committed transaction. Documented trade-off, not an oversight.
 */

@Injectable()
export class SessionRevocationService {
  private readonly blacklistTtlSeconds: number;
  private readonly logger = new Logger(SessionRevocationService.name);
  private readonly warnRedis = throttledWarn(this.logger);
  /** Database verdicts while Redis is away (chain id -> reason | null),
   * 5 s each, single-flighted; an outage path, hence per-chain keys. */
  private readonly dbMemo = new L1Cache<string | null>('authbl-db', {
    ttlMs: 5000,
    maxEntries: 20_000,
    enabled: true,
  });

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tokenService: TokenService,
  ) {
    this.blacklistTtlSeconds = this.tokenService.accessTtlSecondsValue() + 60;
  }

  /** Revokes every not-yet-revoked row in a chain (normally exactly one —
   * rotation immediately revokes the row it replaces) and blacklists the
   * chain so any still-valid access token from it dies immediately. */
  async revokeChain(
    sessionChainId: string,
    reason: RevokeReason,
    tx?: Prisma.TransactionClient | PrismaClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.session.updateMany({
      where: { session_chain_id: sessionChainId, revoked_at: null },
      data: { revoked_at: new Date(), revoked_reason: reason },
    });
    await this.blacklist(sessionChainId);
  }

  async revokeAllChainsForUser(
    userId: string,
    reason: RevokeReason,
    tx?: Prisma.TransactionClient | PrismaClient,
  ): Promise<string[]> {
    const client = tx ?? this.prisma;
    const active = await client.session.findMany({
      where: { user_id: userId, revoked_at: null },
      select: { session_chain_id: true },
      distinct: ['session_chain_id'],
    });
    const chainIds = active.map((s) => s.session_chain_id);
    if (chainIds.length === 0) return chainIds;

    await client.session.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date(), revoked_reason: reason },
    });
    await Promise.all(chainIds.map((id) => this.blacklist(id, reason, userId)));
    return chainIds;
  }

  /**
   * Owner 2026-10-22 (security audit #3, finding 5; OWASP ASVS V3.3.3): after
   * the phone, e-mail or password changes, a thief's session must not
   * survive the owner's "I changed my number and password". Ends every
   * session of the account except [keepChainId] (the one making the
   * change); blacklisting publishes `session:revoked`, so their sockets
   * drop at once.
   */
  async revokeOtherChainsForUser(
    userId: string,
    keepChainId: string | undefined,
    reason: RevokeReason,
  ): Promise<string[]> {
    const active = await this.prisma.session.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        ...(keepChainId ? { session_chain_id: { not: keepChainId } } : {}),
      },
      select: { session_chain_id: true },
      distinct: ['session_chain_id'],
    });
    const chainIds = active.map((s) => s.session_chain_id);
    if (chainIds.length === 0) return chainIds;
    await this.prisma.session.updateMany({
      where: { session_chain_id: { in: chainIds }, revoked_at: null },
      data: { revoked_at: new Date(), revoked_reason: reason },
    });
    await Promise.all(chainIds.map((id) => this.blacklist(id, reason, userId)));
    return chainIds;
  }

  /**
   * Owner 2026-10-01: one session per kind of device — one phone app and
   * one website at the same time. Ends this account's other sessions of
   * the same kind ([web] = a browser; otherwise the phone app).
   */
  async revokeSameKindChains(
    userId: string,
    web: boolean,
    reason: RevokeReason,
  ): Promise<string[]> {
    const active = await this.prisma.session.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        ...(web
          ? { platform: 'web' }
          : { OR: [{ platform: null }, { platform: { not: 'web' } }] }),
      },
      select: { session_chain_id: true },
      distinct: ['session_chain_id'],
    });
    const chainIds = active.map((s) => s.session_chain_id);
    if (chainIds.length === 0) return chainIds;
    await this.prisma.session.updateMany({
      where: { session_chain_id: { in: chainIds }, revoked_at: null },
      data: { revoked_at: new Date(), revoked_reason: reason },
    });
    await Promise.all(chainIds.map((id) => this.blacklist(id, reason, userId)));
    return chainIds;
  }

  async isBlacklisted(sessionChainId: string): Promise<boolean> {
    return (await this.blacklistReason(sessionChainId)) !== null;
  }

  /** Why a blacklisted chain ended ('1' for older entries), or null. */
  async blacklistReason(sessionChainId: string): Promise<string | null> {
    try {
      return await this.redis.get(this.blacklistKey(sessionChainId));
    } catch (error) {
      return this.reasonFromDatabase(sessionChainId, error);
    }
  }

  /**
   * Load test 2026-11-02 (PR #606, LOAD_RESILIENCE §2): with Redis away the
   * guard's one blacklist read failed every authenticated request. The
   * database rows are the source of truth (revoked_at / revoked_reason are
   * written BEFORE the blacklist, see revokeChain), so a lost cache degrades
   * to one indexed single-row read per session chain per 5 s. A chain is
   * alive while any of its rows is not revoked (rotation revokes the older
   * generation with reason 'rotated' and inserts the next one in the same
   * transaction), so the row with revoked_at NULL sorted first decides; no
   * row at all means the chain never existed here — refused.
   */
  private reasonFromDatabase(
    sessionChainId: string,
    cause: unknown,
  ): Promise<string | null> {
    const hit = this.dbMemo.get(sessionChainId);
    if (hit !== undefined) return Promise.resolve(hit);
    this.warnRedis(
      { err: cause, alert: 'session_blacklist_redis_down' },
      'Session blacklist: Redis unavailable, reading sessions from the database',
    );
    return this.dbMemo.getOrLoad(sessionChainId, async () => {
      const row = await this.prisma.session.findFirst({
        where: { session_chain_id: sessionChainId },
        orderBy: { revoked_at: { sort: 'desc', nulls: 'first' } },
        select: { revoked_at: true, revoked_reason: true },
      });
      if (!row) return '1';
      return row.revoked_at === null ? null : (row.revoked_reason ?? '1');
    });
  }

  private async blacklist(
    sessionChainId: string,
    reason: string = '1',
    userId?: string,
  ): Promise<void> {
    // A verdict memoised while Redis was away must not outlive the revocation.
    this.dbMemo.delete(sessionChainId);
    try {
      await this.redis.set(
        this.blacklistKey(sessionChainId),
        reason,
        'EX',
        this.blacklistTtlSeconds,
      );
      // Owner 2026-10-22 (server load audit, finding 5): live sockets of the
      // session are dropped by this message on every API instance, instead
      // of each socket polling the blacklist every 45 s.
      await publishSessionRevoked(this.redis, {
        sessionId: sessionChainId,
        ...(userId ? { userId } : {}),
      });
    } catch (error) {
      // Redis away: the database row (already committed by the caller) is
      // what the guard reads now, so the revocation holds; logging out
      // must not answer 503 because the cache is down. Sockets of the
      // chain fall back to their 45 s blacklist poll.
      if (!isRedisInfraError(error)) throw error;
      this.warnRedis(
        { err: error, alert: 'session_blacklist_redis_down' },
        'Session blacklist: Redis unavailable, revocation kept in the database only',
      );
    }
  }

  private blacklistKey(sessionChainId: string): string {
    return `authbl:${sessionChainId}`;
  }
}
