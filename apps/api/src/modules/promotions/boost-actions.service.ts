import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { PromotionDeliveryService } from './promotion-delivery.service';
import {
  CLIENT_REPORTED_ACTIONS,
  type BoostAction,
} from './promotions.settings';

const LIVE_TTL_MS = 15_000;

interface LiveActionPromo {
  id: string;
  userId: string;
  postId: string | null;
  caseId: string | null;
  kinds: string[];
}

/** Which promotions an action belongs to: of this post / case, of anything
 * by this author, or one promotion by its id. */
export interface ActionMatch {
  postId?: string;
  caseId?: string;
  ownerId?: string;
  promotionId?: string;
}

/**
 * Owner 2026-10-27: real actions for boosts paid per action. The flows that
 * see the action (follow, new chat, bid, case question, save) report it here
 * with one line; the app reports the two it alone sees (watched to the end,
 * opened the profile) through `POST /promotions/:id/action`.
 *
 * Event-driven and cheap: a short in-process list of the running per-action
 * boosts (one query per 15 s per process, none at all while nobody buys
 * them) decides whether an event is looked at. A counted action is one
 * per-person row flip (`promotion_views.acted`, so no double count) and one
 * counter bump through the counter aggregator; the budget check and the
 * unspent-money refund then go through the same finish path as views.
 *
 * Guards, reused from the rest of the Boost: never the owner's own action;
 * only a person who was shown the boost (a promotion_views row); once per
 * person per boost; only the kinds the buyer paid for; one follow / message
 * is counted for ONE boost of an author (the one shown last), not for each.
 * Everything is best effort: a failure never breaks the follow / chat / bid
 * it came from.
 */
@Injectable()
export class BoostActions {
  private readonly logger = new Logger(BoostActions.name);
  private live: { at: number; rows: LiveActionPromo[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: PromotionDeliveryService,
    @Optional() private readonly counters?: CounterAggregator,
  ) {}

  /** Forget the cached list (after a change, and in tests). */
  invalidate(): void {
    this.live = null;
  }

  /** Fire-and-forget version for the services that see the action. */
  report(viewerId: string, match: ActionMatch, kind: BoostAction): void {
    void this.record(viewerId, match, kind);
  }

  /** The app saw an action (watched, profile_open, call) on a promotion. */
  async reportClient(
    viewerId: string,
    promotionId: string,
    kind: (typeof CLIENT_REPORTED_ACTIONS)[number],
  ): Promise<boolean> {
    if (!(CLIENT_REPORTED_ACTIONS as readonly string[]).includes(kind)) {
      return false;
    }
    return (await this.record(viewerId, { promotionId }, kind)) > 0;
  }

  /** Counts the action; returns how many promotions it counted for (0|1). */
  async record(
    viewerId: string,
    match: ActionMatch,
    kind: BoostAction,
  ): Promise<number> {
    try {
      const candidates = (await this.liveActionPromos()).filter(
        (p) =>
          p.userId !== viewerId &&
          p.kinds.includes(kind) &&
          (match.promotionId ? p.id === match.promotionId : true) &&
          (match.postId ? p.postId === match.postId : true) &&
          (match.caseId ? p.caseId === match.caseId : true) &&
          (match.ownerId ? p.userId === match.ownerId : true),
      );
      const narrowed =
        match.promotionId || match.postId || match.caseId || match.ownerId;
      if (!narrowed || candidates.length === 0) return 0;
      // Only a person who was shown it, and who was not counted yet; the
      // boost shown last gets the action.
      const view = await this.prisma.promotionView.findFirst({
        where: {
          user_id: viewerId,
          acted: false,
          promotion: { status: 'active' },
          promotion_id: { in: candidates.map((c) => c.id).slice(0, 50) },
        },
        orderBy: { last_seen_at: 'desc' },
        select: { promotion_id: true },
      });
      if (!view) return 0;
      const flipped = await this.prisma.promotionView.updateMany({
        where: {
          promotion_id: view.promotion_id,
          user_id: viewerId,
          acted: false,
          promotion: { status: 'active' },
        },
        data: { acted: true },
      });
      if (flipped.count === 0) return 0;
      if (this.counters) {
        await this.counters.bump(
          'case_promotion',
          view.promotion_id,
          'actions',
          1,
        );
      } else {
        await this.prisma.casePromotion.update({
          where: { id: view.promotion_id },
          data: { actions: { increment: 1 } },
          select: { id: true },
        });
      }
      // Budget used up → finished now; forget the list so the next action
      // does not see it as running.
      if (await this.delivery.settle(view.promotion_id).catch(() => false)) {
        this.invalidate();
      }
      return 1;
    } catch (e) {
      this.logger.warn({ err: String(e), kind }, 'boost action failed');
      return 0;
    }
  }

  private async liveActionPromos(): Promise<LiveActionPromo[]> {
    if (this.live && Date.now() - this.live.at < LIVE_TTL_MS) {
      return this.live.rows;
    }
    const now = new Date();
    const rows = await this.prisma.casePromotion.findMany({
      where: {
        status: 'active',
        billing: 'actions',
        starts_at: { lte: now },
        ends_at: { gt: now },
      },
      select: {
        id: true,
        user_id: true,
        post_id: true,
        case_id: true,
        billed_actions: true,
      },
      take: 500,
    });
    const list = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      postId: r.post_id,
      caseId: r.case_id,
      kinds: r.billed_actions,
    }));
    this.live = { at: Date.now(), rows: list };
    return list;
  }
}
