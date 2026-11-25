import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../../redis/redis.constants';
import { blockedEitherWay } from '../blocks/block-guard';
import { cachedBlockSet } from '../blocks/block-set.cache';
import { matchesIn } from '../bids/conflict/conflict.logic';
import type { HotlineKeys } from './hotline.store';

/** The attorney's own accepted cases looked through (same as the bid check);
 * the admin's `hotline.conflict_cases_max` (audit 17.11 #8). */
const LOOKBACK = 300;

/**
 * Owner 16.11 (law): the conflict hook before a hotline client is offered to
 * an attorney. Blocks when either blocked the other, or when this client is
 * named (by name, the opposing-party rule of the bid conflict check,
 * bids/conflict/conflict.logic.ts) in a case the attorney handled for
 * somebody else — he may represent the other side. The name answer is
 * remembered in Valkey (`hotline.conflict_cache_sec`), so one pair costs the
 * database at most once an hour, never per heartbeat.
 *
 * Scenarios 24.11 (blocked users): a block is NOT part of that hour-long
 * answer — «Заблокировать и пожаловаться» in a call must keep the two apart
 * from the very next offer (WhatsApp / Telegram: a block applies at once).
 * It is read from the per-user block set that BlocksService.block / unblock
 * drop for both people (`blocks:{uid}`, 60 s), so it costs no query per
 * offer either.
 */
@Injectable()
export class HotlineConflictService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() @Inject(REDIS_CACHE_CLIENT) private readonly cache?: Redis,
  ) {}

  async blocks(
    keys: HotlineKeys,
    lawyerId: string,
    clientId: string,
    cacheSec: number,
    lookback: number = LOOKBACK,
  ): Promise<boolean> {
    if (lawyerId === clientId) return true;
    if (await this.blockedNow(lawyerId, clientId)) return true;
    const k = keys.conflict(lawyerId, clientId);
    if (cacheSec > 0) {
      const hit = await this.redis.get(k);
      if (hit !== null) return hit === '1';
    }
    const blocked = await this.compute(lawyerId, clientId, lookback);
    if (cacheSec > 0)
      await this.redis.set(k, blocked ? '1' : '0', 'EX', cacheSec);
    return blocked;
  }

  /** Either blocked the other, right now (see the class comment). */
  private async blockedNow(lawyerId: string, clientId: string) {
    if (this.cache) {
      try {
        const set = await cachedBlockSet(this.prisma, this.cache, lawyerId);
        return set.includes(clientId);
      } catch {
        // the cache is fail-soft: ask the table
      }
    }
    return blockedEitherWay(this.prisma, lawyerId, clientId);
  }

  private async compute(
    lawyerId: string,
    clientId: string,
    lookback: number,
  ): Promise<boolean> {
    const client = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: { first_name: true, last_name: true },
    });
    const name =
      `${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim();
    if (!name.includes(' ')) return false; // a first name alone matches too much
    const past = await this.prisma.case.findMany({
      where: {
        deleted_at: null,
        client_id: { not: clientId },
        accepted_bid: { is: { attorney_id: lawyerId } },
      },
      orderBy: { created_at: 'desc' },
      take: lookback,
      select: { title: true, description: true },
    });
    const person = { name, phone: null, email: null };
    return past.some((c) =>
      matchesIn(person, `${c.title}\n${c.description}`).includes('name'),
    );
  }
}
