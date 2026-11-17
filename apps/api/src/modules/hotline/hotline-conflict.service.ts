import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { blockedEitherWay } from '../blocks/block-guard';
import { matchesIn } from '../bids/conflict/conflict.logic';
import type { HotlineKeys } from './hotline.store';

/** The attorney's own accepted cases looked through (same as the bid check). */
const LOOKBACK = 300;

/**
 * Owner 16.11 (law): the conflict hook before a hotline client is offered to
 * an attorney. Blocks when either blocked the other, or when this client is
 * named (by name, the opposing-party rule of the bid conflict check,
 * bids/conflict/conflict.logic.ts) in a case the attorney handled for
 * somebody else — he may represent the other side. The answer is remembered
 * in Valkey (`hotline.conflict_cache_sec`), so one pair costs the database
 * at most once an hour, never per heartbeat.
 */
@Injectable()
export class HotlineConflictService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async blocks(
    keys: HotlineKeys,
    lawyerId: string,
    clientId: string,
    cacheSec: number,
  ): Promise<boolean> {
    const k = keys.conflict(lawyerId, clientId);
    if (cacheSec > 0) {
      const hit = await this.redis.get(k);
      if (hit !== null) return hit === '1';
    }
    const blocked = await this.compute(lawyerId, clientId);
    if (cacheSec > 0)
      await this.redis.set(k, blocked ? '1' : '0', 'EX', cacheSec);
    return blocked;
  }

  private async compute(lawyerId: string, clientId: string): Promise<boolean> {
    if (lawyerId === clientId) return true;
    if (await blockedEitherWay(this.prisma, lawyerId, clientId)) return true;
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
      take: LOOKBACK,
      select: { title: true, description: true },
    });
    const person = { name, phone: null, email: null };
    return past.some((c) =>
      matchesIn(person, `${c.title}\n${c.description}`).includes('name'),
    );
  }
}
