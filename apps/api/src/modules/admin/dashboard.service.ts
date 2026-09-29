import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { DashboardDto } from './admin.dto';

/** docs/06 §1.1: "$399 в месяц, единственный тариф". */
export const SUBSCRIPTION_PRICE_USD = 399;
const CACHE_KEY = 'adm:dashboard';
const CACHE_TTL_SECONDS = 60;
const DAY_MS = 86_400_000;

/**
 * docs/06 §2.3 item 1. Fourteen cheap indexed counts, computed at most
 * once a minute for the whole admin team (Redis cache) — the dashboard is
 * the page every admin lands on, and none of these numbers needs to be
 * fresher than that.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async get(): Promise<DashboardDto> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as DashboardDto;
    const fresh = await this.compute();
    await this.redis.set(
      CACHE_KEY,
      JSON.stringify(fresh),
      'EX',
      CACHE_TTL_SECONDS,
    );
    return fresh;
  }

  private async compute(): Promise<DashboardDto> {
    const now = new Date();
    const since24h = new Date(now.getTime() - DAY_MS);
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const p = this.prisma;
    const [
      clients24h,
      attorneys24h,
      clients7d,
      attorneys7d,
      queueSize,
      oldest,
      trialing,
      active,
      pastDue,
      openCases,
      bids24h,
      openReports,
      openDisputes,
      openContactIssues,
    ] = await Promise.all([
      p.user.count({
        where: { role: 'client', created_at: { gte: since24h } },
      }),
      p.user.count({
        where: { role: 'attorney', created_at: { gte: since24h } },
      }),
      p.user.count({ where: { role: 'client', created_at: { gte: since7d } } }),
      p.user.count({
        where: { role: 'attorney', created_at: { gte: since7d } },
      }),
      p.verificationRequest.count({
        where: { status: { in: ['submitted', 'in_review'] } },
      }),
      p.verificationRequest.findFirst({
        where: { status: { in: ['submitted', 'in_review'] } },
        orderBy: { submitted_at: 'asc' },
        select: { submitted_at: true },
      }),
      p.subscription.count({ where: { status: 'trialing' } }),
      p.subscription.count({ where: { status: 'active' } }),
      p.subscription.count({ where: { status: 'past_due' } }),
      p.case.count({ where: { status: 'open' } }),
      p.bid.count({ where: { created_at: { gte: since24h } } }),
      p.report.count({ where: { status: 'open' } }),
      p.caseDispute.count({ where: { status: 'open' } }),
      p.contactIssueReport.count({ where: { status: 'open' } }),
    ]);
    return {
      newUsers: { clients24h, attorneys24h, clients7d, attorneys7d },
      verification: {
        queueSize,
        oldestAgeSeconds: oldest?.submitted_at
          ? Math.floor((now.getTime() - oldest.submitted_at.getTime()) / 1000)
          : null,
      },
      subscriptions: {
        trialing,
        active,
        pastDue,
        revenueEstimateUsd: active * SUBSCRIPTION_PRICE_USD,
      },
      openCases,
      bids24h,
      openReports,
      openDisputes,
      openContactIssues,
      computedAt: now.toISOString(),
    };
  }
}
