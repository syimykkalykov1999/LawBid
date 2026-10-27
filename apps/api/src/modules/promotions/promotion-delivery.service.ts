import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PromotionRefundsService } from './promotion-refunds.service';
import {
  budgetSpent,
  deliveredUnits,
  parseAudience,
  parsePromotionSettings,
  PROMOTION_SETTINGS_KEY,
  targetUnits,
  unitField,
  type DeliveryCounts,
  type PromotionAudience,
  type PromotionSettings,
  type PromotionTarget,
  RETIRED_PROMOTION_CTA_TYPES,
} from './promotions.settings';

/** A running promotion as the feeds see it. */
export interface LivePromotion {
  id: string;
  userId: string;
  caseId: string | null;
  postId: string | null;
  audience: PromotionAudience;
  /** Owner 2026-10-27: progress in the unit it is paid for (views, people,
   * taps or actions) and what the budget buys (null = no cap). */
  delivered: number;
  target: number | null;
  startsAt: Date;
  endsAt: Date;
  ctaType: string | null;
  ctaValue: string | null;
}

/** What the audience filter knows about a viewer. */
export interface ViewerProfile {
  role: 'attorney' | 'client' | null;
  country: string | null;
  states: string[];
  topics: string[];
}

const LIVE_TTL_MS = 15_000;
const PROFILE_TTL_MS = 5 * 60_000;
const PROFILE_CACHE_MAX = 5_000;
const SETTINGS_TTL_MS = 30_000;

export const dayKey = (d = new Date()): string => d.toISOString().slice(0, 10);

/** Empty lists match everyone; a viewer we know nothing about only sees
 * promotions that do not narrow on that field. */
export function audienceMatches(
  a: PromotionAudience,
  v: ViewerProfile,
): boolean {
  if (a.role === 'attorneys' && v.role !== 'attorney') return false;
  if (a.role === 'clients' && v.role !== 'client') return false;
  if (a.countries.length && (!v.country || !a.countries.includes(v.country))) {
    return false;
  }
  if (a.states.length && !v.states.some((s) => a.states.includes(s))) {
    return false;
  }
  if (a.topics.length && !v.topics.some((t) => a.topics.includes(t))) {
    return false;
  }
  return true;
}

/** Behind schedule first: delivered share ÷ elapsed share of the period,
 * so a budget is spread over its days instead of burned in an hour. */
export function pacingScore(p: LivePromotion, now = Date.now()): number {
  if (!p.target) return 0.5;
  const span = Math.max(1, p.endsAt.getTime() - p.startsAt.getTime());
  const elapsed = Math.min(
    1,
    Math.max(0.01, (now - p.startsAt.getTime()) / span),
  );
  return p.delivered / p.target / elapsed;
}

/**
 * Owner 2026-10-05 (Instagram-style promotion): picks which promoted
 * posts / cases a viewer gets — audience, budget left, per-person daily
 * frequency cap, never their own — and records impressions (unique reach
 * in promotion_views). A promotion whose budget is spent finishes at once.
 * Everything here is best effort: a failure never breaks a feed.
 */
@Injectable()
export class PromotionDeliveryService {
  private readonly logger = new Logger(PromotionDeliveryService.name);
  private live = new Map<
    PromotionTarget,
    { at: number; rows: LivePromotion[] }
  >();
  private profiles = new Map<string, { at: number; p: ViewerProfile }>();
  private settingsCache: { at: number; s: PromotionSettings } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    // Owner 2026-10-25 (DB audit finding 8): the promotion row is hot — its
    // impressions / reach / clicks go through the counter aggregator.
    @Optional() private readonly counters?: CounterAggregator,
    // Owner 2026-10-27: a boost paid per people / taps / actions that ends
    // early gives the unspent part back.
    @Optional() private readonly refunds?: PromotionRefundsService,
  ) {}

  async settings(): Promise<PromotionSettings> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.at < SETTINGS_TTL_MS) {
      return this.settingsCache.s;
    }
    const row = await this.prisma.appConfig.findUnique({
      where: { key: PROMOTION_SETTINGS_KEY },
    });
    const s = parsePromotionSettings(row?.value);
    this.settingsCache = { at: now, s };
    return s;
  }

  /** Forget cached settings / live lists (after a change). */
  invalidate(): void {
    this.settingsCache = null;
    this.live.clear();
  }

  async liveList(target: PromotionTarget): Promise<LivePromotion[]> {
    const cached = this.live.get(target);
    if (cached && Date.now() - cached.at < LIVE_TTL_MS) return cached.rows;
    const now = new Date();
    const rows = await this.prisma.casePromotion.findMany({
      where: {
        target_type: target,
        status: 'active',
        starts_at: { lte: now },
        ends_at: { gt: now },
      },
      select: {
        id: true,
        user_id: true,
        case_id: true,
        post_id: true,
        audience: true,
        ...COUNTS,
        starts_at: true,
        ends_at: true,
        cta_type: true,
        cta_value: true,
      },
      orderBy: { starts_at: 'asc' },
      take: 500,
    });
    const list = rows
      .filter((r) => !budgetSpent(r))
      .map((r) => ({
        id: r.id,
        userId: r.user_id,
        caseId: r.case_id,
        postId: r.post_id,
        audience: parseAudience(r.audience),
        delivered: deliveredUnits(r),
        target: targetUnits(r),
        startsAt: r.starts_at ?? now,
        endsAt: r.ends_at ?? now,
        // Owner 2026-10-19: a retired button («Download») is not shown.
        ...(r.cta_type && RETIRED_PROMOTION_CTA_TYPES.includes(r.cta_type)
          ? { ctaType: null, ctaValue: null }
          : { ctaType: r.cta_type, ctaValue: r.cta_value }),
      }));
    this.live.set(target, { at: Date.now(), rows: list });
    return list;
  }

  async viewerProfile(userId: string): Promise<ViewerProfile> {
    const hit = this.profiles.get(userId);
    if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.p;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        country_code: true,
        client_profile: { select: { state_code: true } },
      },
    });
    const p: ViewerProfile = {
      role: u?.role === 'attorney' || u?.role === 'client' ? u.role : null,
      country: u?.country_code ?? null,
      states: [],
      topics: [],
    };
    const category = (code: string) => code.split('.')[0];
    if (p.role === 'attorney') {
      const [licenses, practices] = await Promise.all([
        this.prisma.attorneyLicense.findMany({
          where: { attorney_id: userId },
          select: { state_code: true },
          take: 60,
        }),
        this.prisma.attorneyPracticeArea.findMany({
          where: { attorney_id: userId },
          select: { practice_area: { select: { code: true } } },
          take: 100,
        }),
      ]);
      p.states = [...new Set(licenses.map((l) => l.state_code))];
      p.topics = [
        ...new Set(practices.map((x) => category(x.practice_area.code))),
      ];
    } else if (p.role === 'client') {
      if (u?.client_profile?.state_code) {
        p.states = [u.client_profile.state_code];
      }
      const cases = await this.prisma.case.findMany({
        where: { client_id: userId },
        select: { practice_area: { select: { code: true } } },
        orderBy: { created_at: 'desc' },
        take: 20,
      });
      p.topics = [...new Set(cases.map((c) => category(c.practice_area.code)))];
    }
    if (this.profiles.size >= PROFILE_CACHE_MAX) this.profiles.clear();
    this.profiles.set(userId, { at: Date.now(), p });
    return p;
  }

  /**
   * Promotions [viewerId] may be shown now, best candidates first:
   * audience match, not their own, budget left, under today's cap.
   */
  async eligible(
    target: PromotionTarget,
    viewerId: string,
    opts: { excludeUserIds?: Iterable<string> } = {},
  ): Promise<LivePromotion[]> {
    try {
      const all = await this.liveList(target);
      if (all.length === 0) return [];
      const [profile, settings] = await Promise.all([
        this.viewerProfile(viewerId),
        this.settings(),
      ]);
      const skip = new Set(opts.excludeUserIds ?? []);
      skip.add(viewerId);
      const matching = all.filter(
        (p) => !skip.has(p.userId) && audienceMatches(p.audience, profile),
      );
      if (matching.length === 0) return [];
      const views = await this.prisma.promotionView.findMany({
        where: {
          user_id: viewerId,
          promotion_id: { in: matching.map((p) => p.id) },
          day_key: dayKey(),
          day_count: { gte: settings.frequencyCapPerDay },
        },
        select: { promotion_id: true },
      });
      const capped = new Set(views.map((v) => v.promotion_id));
      const now = Date.now();
      return matching
        .filter((p) => !capped.has(p.id))
        .map((p) => ({ p, s: pacingScore(p, now) + Math.random() * 0.05 }))
        .sort((a, b) => a.s - b.s)
        .map((x) => x.p);
    } catch (e) {
      this.logger.warn({ err: String(e) }, 'promotion pick failed');
      return [];
    }
  }

  /** Fire-and-forget: count that [viewerId] was shown [promotionIds]. */
  recordImpressions(viewerId: string, promotionIds: string[]): void {
    if (promotionIds.length === 0) return;
    void this.record(viewerId, [...new Set(promotionIds)]).catch((e) =>
      this.logger.warn({ err: String(e) }, 'promotion impressions failed'),
    );
  }

  /** Awaitable version of recordImpressions (tests, jobs). */
  async record(viewerId: string, ids: string[]): Promise<void> {
    const today = dayKey();
    const now = new Date();
    const existing = await this.prisma.promotionView.findMany({
      where: { user_id: viewerId, promotion_id: { in: ids } },
    });
    const byId = new Map(existing.map((v) => [v.promotion_id, v]));
    for (const id of ids) {
      const v = byId.get(id);
      let newPerson = false;
      if (v) {
        await this.prisma.promotionView.update({
          where: {
            promotion_id_user_id: { promotion_id: id, user_id: viewerId },
          },
          data: {
            impressions: { increment: 1 },
            day_key: today,
            day_count: v.day_key === today ? { increment: 1 } : 1,
            last_seen_at: now,
          },
        });
      } else {
        try {
          await this.prisma.promotionView.create({
            data: {
              promotion_id: id,
              user_id: viewerId,
              impressions: 1,
              day_key: today,
              day_count: 1,
            },
          });
          newPerson = true;
        } catch {
          // A parallel request created it: count the impression only.
        }
      }
      await this.bumpDaily(id, today, {
        impressions: 1,
        reach: newPerson ? 1 : 0,
      });
      await this.bumpPromotion(id, {
        impressions: 1,
        reach: newPerson ? 1 : 0,
      });
      await this.settle(id);
    }
  }

  /** Adds impressions / reach to a promotion. With the aggregator the row is
   * not written: the delta waits in Redis until the next flush. */
  private async bumpPromotion(
    id: string,
    d: { impressions: number; reach: number },
  ): Promise<void> {
    if (!this.counters) {
      await this.prisma.casePromotion.update({
        where: { id },
        data: {
          impressions: { increment: d.impressions },
          ...(d.reach ? { reach: { increment: d.reach } } : {}),
        },
        select: { id: true },
      });
      return;
    }
    await this.counters.bump(
      'case_promotion',
      id,
      'impressions',
      d.impressions,
    );
    if (d.reach)
      await this.counters.bump('case_promotion', id, 'reach', d.reach);
  }

  /**
   * Owner 2026-10-27: finishes a promotion whose budget is used up, counted
   * in the unit it is paid for (views, people, taps or actions). The row is
   * read and the not yet flushed delta of that one counter is added, so the
   * cap triggers on the same count the buyer sees.
   */
  async settle(id: string): Promise<boolean> {
    const row = await this.prisma.casePromotion.findUniqueOrThrow({
      where: { id },
      select: { ...COUNTS, ...OWNER, status: true },
    });
    if (row.status !== 'active') return false;
    const field = unitField(row.billing);
    let p: DeliveryCounts = row;
    if (this.counters) {
      const pending = await this.counters.pending('case_promotion', field, [
        id,
      ]);
      p = { ...row, [field]: row[field] + (pending.get(id) ?? 0) };
    }
    if (!budgetSpent(p)) return false;
    return this.finish(id, row, 'budget_spent');
  }

  /** active → finished (budget spent / time over), notifying the owner. */
  async finish(
    id: string,
    p: { user_id: string; case_id: string | null; post_id: string | null },
    reason: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    const res = await db.casePromotion.updateMany({
      where: { id, status: 'active' },
      data: { status: 'finished', cancel_reason: reason },
    });
    if (res.count === 0) return false;
    this.live.clear();
    // Owner 2026-10-27: paid per people / taps / actions and ended before
    // the budget was used → the unspent part goes back (views: old rule).
    if (reason !== 'budget_spent') await this.refunds?.refundUnspent(id);
    await this.notifications
      ?.emit({
        type: 'promotion_ended',
        recipientId: p.user_id,
        payload: {
          promotionId: id,
          ...(p.case_id ? { caseId: p.case_id } : {}),
          ...(p.post_id ? { postId: p.post_id } : {}),
        },
      })
      .catch(() => undefined);
    return true;
  }

  /** A viewer opened a promoted post / case (counted once per person). */
  async click(viewerId: string, promotionId: string): Promise<boolean> {
    const res = await this.prisma.promotionView.updateMany({
      where: {
        promotion_id: promotionId,
        user_id: viewerId,
        clicked: false,
        // Never the owner's own tap (paid per tap).
        promotion: { user_id: { not: viewerId } },
      },
      data: { clicked: true },
    });
    if (res.count === 0) return false;
    if (this.counters) {
      await this.counters.bump('case_promotion', promotionId, 'clicks', 1);
    } else {
      await this.prisma.casePromotion.update({
        where: { id: promotionId },
        data: { clicks: { increment: 1 } },
      });
    }
    await this.bumpDaily(promotionId, dayKey(), { clicks: 1 }).catch(
      () => undefined,
    );
    await this.settle(promotionId).catch(() => undefined);
    return true;
  }

  /** The numbers of one day, for the bars on the stats screen. */
  private async bumpDaily(
    id: string,
    day: string,
    d: { impressions?: number; reach?: number; clicks?: number },
  ): Promise<void> {
    const impressions = d.impressions ?? 0;
    const reach = d.reach ?? 0;
    const clicks = d.clicks ?? 0;
    await this.prisma.promotionDaily.upsert({
      where: { promotion_id_day_key: { promotion_id: id, day_key: day } },
      create: {
        promotion_id: id,
        day_key: day,
        impressions,
        reach,
        clicks,
      },
      update: {
        impressions: { increment: impressions },
        reach: { increment: reach },
        clicks: { increment: clicks },
      },
    });
  }
}

/** The counters a promotion's budget is measured in. */
const COUNTS = {
  billing: true,
  impressions: true,
  reach: true,
  clicks: true,
  actions: true,
  target_units: true,
  target_impressions: true,
} as const;

const OWNER = { user_id: true, case_id: true, post_id: true } as const;
