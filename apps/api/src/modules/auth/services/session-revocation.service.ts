import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Prisma, PrismaClient } from '@prisma/client';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { PrismaService } from '../../../prisma/prisma.service';
import { TokenService } from './token.service';

export type RevokeReason =
  | 'logout'
  | 'logout_all'
  | 'rotated'
  | 'reuse_detected'
  | 'admin_block'
  | 'account_deletion';

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
    await Promise.all(chainIds.map((id) => this.blacklist(id)));
    return chainIds;
  }

  async isBlacklisted(sessionChainId: string): Promise<boolean> {
    const value = await this.redis.get(this.blacklistKey(sessionChainId));
    return value !== null;
  }

  private async blacklist(sessionChainId: string): Promise<void> {
    await this.redis.set(
      this.blacklistKey(sessionChainId),
      '1',
      'EX',
      this.blacklistTtlSeconds,
    );
  }

  private blacklistKey(sessionChainId: string): string {
    return `authbl:${sessionChainId}`;
  }
}
