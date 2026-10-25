import { CasePhotosService } from './case-photos.service';
import {
  loadUrgencyThresholds,
  urgencyFields,
  urgencyFilterSql,
} from '../domain/case-urgency';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma, type Case, type PracticeArea } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
} from '../../../common/pagination/cursor.util';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PostEngagementService } from '../../posts/post-engagement.service';
import { CounterAggregator } from '../../counters/counter-aggregator.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CaseDetailForAttorneyDto,
  CaseFeedItemDto,
  CaseFeedPage,
  CASES_FEED_PAGE_DEFAULT,
  CASE_NEW_BADGE_HOURS,
  ListCasesFeedQueryDto,
  SavedItemDto,
} from '../dto/cases-feed.dto';
import {
  caseNotAvailable,
  CaseAccessPolicy,
  type CaseViewer,
} from '../policies/case-access.policy';
import { readsAreSplit } from '../../../sharding/split-reads';
import {
  blockedPeople,
  resolveFeedGlobals,
  scatterFeed,
} from '../queries/cases-feed.split';
import {
  buildPracticeCasesSql,
  buildVisibleCasesSql,
} from '../queries/cases-visible.sql';
import { budgetFilterSql } from '../queries/budget-filter.sql';
import { CaseViewTrackingService } from './case-view-tracking.service';
import {
  ClientActivityService,
  type ClientActivityView,
} from './client-activity.service';
import { PromotionDeliveryService } from '../../promotions/promotion-delivery.service';
import { RecommendationsService } from '../../recommendations/recommendations.service';
import {
  clientsWithEntitlementSql,
  EntitlementsService,
} from '../../plans/entitlements.service';

/** Owner 2026-10-02: promoted cases on top of the first feed page. */
const PROMOTED_FEED_SLOTS = 3;
/** Owner 2026-10-05 (plan builder): cases of clients whose plan includes
 * "cases shown first" come right after the promoted ones on page one. */
const PRIORITY_FEED_SLOTS = 5;
/** Candidates ranked by the "for you" order: the newest this many. */
const CASES_RANK_CANDIDATES = 300;
const PRIORITY_CLIENT_SQL = clientsWithEntitlementSql(
  'priority_feed',
  Prisma.sql`c.client_id`,
);

type CaseWithPracticeArea = Case & {
  practice_area: PracticeArea & { parent: PracticeArea | null };
  states: { state_code: string; is_primary: boolean }[];
  _count?: { extra_practices: number };
};

const CASE_WITH_PRACTICE_AREA_INCLUDE = {
  practice_area: { include: { parent: true } },
  // Owner 2026-10-15: «+N» topics on the card.
  _count: { select: { extra_practices: true } },
  states: { select: { state_code: true, is_primary: true } },
} as const;

function forbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });
}

/**
 * docs/04_CASES_BIDS.md §4 (stage 4.3): the attorney "Cases" tab feed,
 * case detail (no client field ever included) and view tracking. Bids
 * and negotiation (§5, §6) are stage 4.4; client-side case management
 * (§3.5, `GET /users/me/cases`) is stage 4.2 (CasesController).
 */
/** Feed card description preview length (owner 2026-09-30). */
const FEED_EXCERPT_MAX = 400;

@Injectable()
export class CasesFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessPolicy,
    private readonly viewTracking: CaseViewTrackingService,
    private readonly posts: PostEngagementService,
    @Optional() private readonly photos?: CasePhotosService,
    @Optional() private readonly counters?: CounterAggregator,
    @Optional() private readonly entitlements?: EntitlementsService,
    @Optional() private readonly settings?: AppSettingsService,
    // Owner 2026-10-05: budget, audience, frequency cap and reach.
    @Optional() private readonly promoDelivery?: PromotionDeliveryService,
    // Owner 2026-10-13: "for you" ranking of the Search Cases grid.
    @Optional() private readonly recommendations?: RecommendationsService,
    // Owner 2026-10-18 (OQ-054): the activity line on the card.
    @Optional() private readonly clientActivity?: ClientActivityService,
  ) {}

  /** GET /cases (docs/04 §4.2). Empty page, not an error, for a caller
   * who is not an attorney, not verified, has no verified license or no
   * chosen practice — the feed query already returns nothing for the
   * license/practice cases (empty attorney_licenses/attorney_practice_areas
   * join); verification_status is checked here because the canonical §5.4
   * query (test/db-roles-indexes.e2e-spec.ts) intentionally does not
   * carry it, to keep that shape index-only. */
  async listFeed(
    viewer: CaseViewer,
    query: ListCasesFeedQueryDto,
  ): Promise<CaseFeedPage> {
    if (viewer.role !== 'attorney') {
      throw forbidden('Only attorneys have a case feed.');
    }
    if (!(await this.isVerifiedAttorney(viewer.userId))) {
      return { items: [], nextCursor: null };
    }
    const limit = query.limit ?? CASES_FEED_PAGE_DEFAULT;
    const ranked = query.sort === 'for_you' && !!this.recommendations;
    const cursor =
      query.cursor && !ranked ? decodeCursor(query.cursor) : undefined;

    // Audit 2026-10-01: the Search tab's filters on the server.
    const spanMs =
      query.period === '24h'
        ? 24 * 3600e3
        : query.period === '7d'
          ? 7 * 24 * 3600e3
          : query.period === '30d'
            ? 30 * 24 * 3600e3
            : null;
    const since = spanMs ? new Date(Date.now() - spanMs) : undefined;
    // Owner 2026-10-05: "urgent and above" / "with a date" filters.
    const thresholds = await loadUrgencyThresholds(this.settings);
    // Shard-ready step 8: with several databases the global parts of the
    // rule (licences, topics, blocks) are resolved first and the statement
    // touches the case family only (cases-feed.split.ts).
    const split = readsAreSplit(this.prisma);
    const globals = split
      ? await resolveFeedGlobals(this.prisma, viewer.userId, {
          practiceCategory: query.practiceCategory,
          practice: query.practice,
        })
      : undefined;
    const blockedIds = split
      ? await blockedPeople(this.prisma, viewer.userId)
      : [];
    const blocksFilter = split
      ? Prisma.sql`AND c.client_id <> ALL(${blockedIds}::UUID[])`
      : Prisma.sql`AND NOT EXISTS (SELECT 1 FROM user_blocks ub
        WHERE (ub.blocker_id = ${viewer.userId}::UUID AND ub.blocked_id = c.client_id)
           OR (ub.blocker_id = c.client_id AND ub.blocked_id = ${viewer.userId}::UUID))`;
    const extra = Prisma.sql`
      ${urgencyFilterSql(query.minUrgency, query.hasDeadline, thresholds)}
      ${budgetFilterSql({
        minCents:
          query.budgetMin === undefined ? undefined : query.budgetMin * 100,
        maxCents:
          query.budgetMax === undefined ? undefined : query.budgetMax * 100,
        unknown: query.budgetUnknown,
        percent: query.budgetPercent,
        percentMax: query.percentMax,
      })}
      ${query.noBids ? Prisma.sql`AND c.bids_count = 0` : Prisma.empty}
      ${blocksFilter}`;
    const run = (
      filter: Prisma.Sql,
      pageCursor: typeof cursor,
      take: number,
    ): Promise<{ id: string; created_at: Date }[]> => {
      const sql = query.practice
        ? buildPracticeCasesSql({
            globals,
            attorneyId: viewer.userId,
            practice: query.practice,
            browseAll: query.scope === 'all',
            state: query.state,
            states: query.states?.split(','),
            cursor: pageCursor,
            limit: take,
            since,
            extra: filter,
          })
        : buildVisibleCasesSql({
            globals,
            attorneyId: viewer.userId,
            practiceAreaId: query.practiceAreaId,
            practiceCategory: query.practiceCategory,
            browseAll: query.scope === 'all',
            state: query.state,
            states: query.states?.split(','),
            cursor: pageCursor,
            limit: take,
            since,
            extra: filter,
          });
      return split
        ? scatterFeed(this.prisma, sql, take)
        : this.prisma.$queryRaw<{ id: string; created_at: Date }[]>(sql);
    };
    // Owner 2026-10-02 (paid case promotion): up to PROMOTED_FEED_SLOTS
    // active promoted cases this attorney may see (same filters) go on top
    // of the first page and are left out of the keyset pages, so cursor
    // pagination stays intact and nothing repeats.
    // Owner 2026-10-05: only promotions with budget left, matching this
    // attorney and under today's per-person cap, best-paced first.
    const live = this.promoDelivery
      ? await this.promoDelivery.eligible('case', viewer.userId)
      : null;
    const slots = this.promoDelivery
      ? (await this.promoDelivery.settings()).caseFeedSlots
      : PROMOTED_FEED_SLOTS;
    const promotedIds = live
      ? [...new Set(live.flatMap((p) => (p.caseId ? [p.caseId] : [])))]
      : await this.activePromotedCaseIds();
    const visiblePromoted =
      promotedIds.length && slots > 0
        ? new Set(
            (
              await run(
                Prisma.sql`${extra} AND c.id = ANY(${promotedIds}::UUID[])`,
                undefined,
                promotedIds.length,
              )
            ).map((r) => r.id),
          )
        : new Set<string>();
    // Keep the pacing order, then the slot count.
    const slot = promotedIds
      .filter((id) => visiblePromoted.has(id))
      .slice(0, slots);
    // Owner 2026-10-05: then the newest cases of clients on a plan with
    // "cases shown first" — same filters, same keyset exclusion.
    const priority = cursor
      ? []
      : (
          await run(
            Prisma.sql`${extra} AND ${PRIORITY_CLIENT_SQL}
              ${slot.length ? Prisma.sql`AND c.id <> ALL(${slot}::UUID[])` : Prisma.empty}`,
            undefined,
            PRIORITY_FEED_SLOTS,
          )
        ).map((r) => r.id);
    const onTop = [...slot, ...priority];
    const rest = onTop.length
      ? Prisma.sql`${extra} AND c.id <> ALL(${onTop}::UUID[])`
      : extra;
    // Owner 2026-10-13: "for you" — the newest candidates ranked for this
    // attorney, paged by position; promoted and priority cases stay on top
    // of page one as before (and out of the ranked list on every page).
    if (ranked && this.recommendations) {
      const start = rankedOffset(query.cursor);
      const candidates = (
        await run(rest, undefined, CASES_RANK_CANDIDATES)
      ).map((r) => r.id);
      const ids = await this.recommendations.casesFor(
        viewer.userId,
        candidates,
        { ...query, sort: undefined, cursor: undefined, limit: undefined },
      );
      const end = start + limit;
      const shownPromoted = start === 0 ? slot : [];
      const top = start === 0 ? onTop : [];
      const items = await this.hydrate(
        [...new Set([...top, ...ids.slice(start, end)])],
        viewer.userId,
      );
      this.recordPromotedImpressions(viewer.userId, live, shownPromoted);
      return {
        items,
        nextCursor: end < ids.length ? encodeRankedOffset(end) : null,
      };
    }
    const rows = await run(rest, cursor, limit + 1);
    const page = rows.slice(0, limit);
    const shownPromoted = cursor ? [] : slot;
    const items = await this.hydrate(
      [...new Set([...shownPromoted, ...priority, ...page.map((r) => r.id)])],
      viewer.userId,
    );
    this.recordPromotedImpressions(viewer.userId, live, shownPromoted);
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** Promoted cases shown on page one count as impressions. */
  private recordPromotedImpressions(
    viewerId: string,
    live: Awaited<ReturnType<PromotionDeliveryService['eligible']>> | null,
    shownPromoted: string[],
  ): void {
    if (shownPromoted.length === 0) return;
    if (live && this.promoDelivery) {
      this.promoDelivery.recordImpressions(
        viewerId,
        live
          .filter((p) => p.caseId && shownPromoted.includes(p.caseId))
          .map((p) => p.id),
      );
    } else {
      this.countImpressions(shownPromoted);
    }
  }

  /** GET /cases/:id for an attorney (docs/04 §4.3): CASE_NOT_AVAILABLE,
   * never CASE_NOT_FOUND, and never a client field. */
  async getDetailForAttorney(
    attorneyId: string,
    caseId: string,
  ): Promise<CaseDetailForAttorneyDto> {
    const access = await this.access.assertVisibleToAttorney(
      attorneyId,
      caseId,
    );
    const [item] = await this.hydrate([caseId], attorneyId);
    // The access check and the hydrate read are not in the same
    // transaction; a case deleted/closed/moved in between is possible but
    // vanishingly unlikely — still handled, not left as a 500.
    if (!item) throw caseNotAvailable();
    const [row, saved, ownBid] = await Promise.all([
      this.prisma.case.findUniqueOrThrow({
        where: { id: caseId },
        select: {
          description: true,
          status: true,
          client_completed_at: true,
          attorney_confirmed_at: true,
        },
      }),
      this.prisma.savedItem.findFirst({
        where: { user_id: attorneyId, item_type: 'case', item_id: caseId },
        select: { user_id: true },
      }),
      this.prisma.bid.findUnique({
        where: {
          case_id_attorney_id: { case_id: caseId, attorney_id: attorneyId },
        },
        select: { id: true, status: true },
      }),
    ]);
    const media = this.photos
      ? await this.photos.forViewer(caseId, attorneyId)
      : { photos: [], photosCount: 0, privateDetails: null };
    return {
      ...item,
      description: row.description,
      isSaved: !!saved,
      ownBidId: ownBid?.id ?? null,
      acceptedBidIsMine: ownBid?.status === 'accepted',
      completionRequestedBy:
        row.status !== 'pending_completion'
          ? null
          : row.client_completed_at && !row.attorney_confirmed_at
            ? 'client'
            : row.attorney_confirmed_at && !row.client_completed_at
              ? 'attorney'
              : null,
      ...media,
      inMyPractice: access.inPractice,
      inMyLicensedStates: access.inLicensedState,
      // Owner 2026-10-04: an attorney may bid on any open case — unless the
      // plan's "offers in any state" term is off (plan builder, 2026-10-05).
      bidAllowed:
        access.kind !== 'attorney_browser' ||
        !this.entitlements ||
        (await this.entitlements.has(attorneyId, 'bids_any_state')),
      priorityClient: item.priorityClient,
    };
  }

  /** POST /cases/:id/view (docs/04 §4.3): dedup + batched counter. The
   * attorney must currently be able to see the case. */
  async recordView(attorneyId: string, caseId: string): Promise<void> {
    await this.access.assertVisibleToAttorney(attorneyId, caseId);
    await this.viewTracking.recordView(attorneyId, caseId);
  }

  /** POST /cases/views (owner 2026-10-22, package A): the same, for many
   * cases in one request; a case the attorney may not see is skipped. */
  async recordViews(attorneyId: string, caseIds: string[]): Promise<void> {
    for (const caseId of [...new Set(caseIds)]) {
      try {
        await this.access.assertVisibleToAttorney(attorneyId, caseId);
      } catch {
        continue;
      }
      await this.viewTracking.recordView(attorneyId, caseId);
    }
  }

  /** POST /saved-items (docs/04 §4.3 "Сохранить", §11.2, §15). Only
   * attorney with current visibility on the case can save it (§4.3 button
   * only appears there); posts (docs/05 §4) go to PostEngagementService. */
  async save(viewer: CaseViewer, dto: SavedItemDto): Promise<void> {
    // docs/05 §4: posts are saved by anyone who can see them.
    if (dto.itemType === 'post') {
      return this.posts.save(viewer.userId, dto.itemId);
    }
    if (viewer.role !== 'attorney') {
      throw forbidden('Only attorneys save cases (§11.2).');
    }
    await this.access.assertVisibleToAttorney(viewer.userId, dto.itemId);
    await this.prisma.savedItem.upsert({
      where: {
        user_id_item_type_item_id: {
          user_id: viewer.userId,
          item_type: 'case',
          item_id: dto.itemId,
        },
      },
      create: {
        user_id: viewer.userId,
        item_type: 'case',
        item_id: dto.itemId,
      },
      update: {},
    });
  }

  /** DELETE /saved-items. No visibility check on the way out: unsaving a
   * case that became unavailable since must still work (§11.2
   * "закрытые/недоступные с пометкой «Кейс недоступен»" — the item can
   * still be removed from the list). */
  async unsave(viewer: CaseViewer, dto: SavedItemDto): Promise<void> {
    if (dto.itemType === 'post') {
      return this.posts.unsave(viewer.userId, dto.itemId);
    }
    await this.prisma.savedItem.deleteMany({
      where: {
        user_id: viewer.userId,
        item_type: 'case',
        item_id: dto.itemId,
      },
    });
  }

  async isVerifiedAttorney(attorneyId: string): Promise<boolean> {
    const profile = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: { verification_status: true },
    });
    return profile?.verification_status === 'verified';
  }

  /** Feed-card representation of cases by id (order kept, missing ids
   * skipped). Also used by the saved-cases list (docs/04 §11.2). */
  async hydrate(ids: string[], attorneyId: string): Promise<CaseFeedItemDto[]> {
    if (ids.length === 0) return [];
    const [rows, ownBids, saved, pendingComments, pendingShares, files] =
      await Promise.all([
        this.prisma.case.findMany({
          where: { id: { in: ids } },
          include: CASE_WITH_PRACTICE_AREA_INCLUDE,
        }) as Promise<CaseWithPracticeArea[]>,
        this.prisma.bid.findMany({
          where: { attorney_id: attorneyId, case_id: { in: ids } },
          select: { case_id: true },
        }),
        this.prisma.savedItem.findMany({
          where: {
            user_id: attorneyId,
            item_type: 'case',
            item_id: { in: ids },
          },
          select: { item_id: true },
        }),
        this.counters
          ? this.counters.pending('case', 'comment_count', ids)
          : Promise.resolve(new Map<string, number>()),
        this.counters
          ? this.counters.pending('case', 'share_count', ids)
          : Promise.resolve(new Map<string, number>()),
        this.photos
          ? this.photos.counts(ids)
          : Promise.resolve(
              new Map<string, { images: number; documents: number }>(),
            ),
      ]);
    const bidCaseIds = new Set(ownBids.map((b) => b.case_id));
    const savedIds = new Set(saved.map((s) => s.item_id));
    // Owner 2026-10-18 (speed): these four reads do not depend on each other.
    const [promotedEnds, priorityClients, activity, thresholds] =
      await Promise.all([
        this.activePromotedEnds(ids),
        this.priorityClientIds(rows.map((r) => r.client_id)),
        this.activityOf(
          attorneyId,
          rows.map((r) => r.client_id),
        ),
        loadUrgencyThresholds(this.settings),
      ]);
    const promoted = new Set(promotedEnds.keys());
    const byId = new Map(rows.map((r) => [r.id, r]));
    const now = Date.now();
    const items: CaseFeedItemDto[] = [];
    for (const id of ids) {
      const c = byId.get(id);
      if (!c) continue; // race with a concurrent delete; skip, don't 500
      const leaf = c.practice_area;
      const category = leaf.parent ?? leaf;
      items.push({
        id: c.id,
        title: c.title,
        // Owner 2026-09-30: a short preview for the feed card.
        excerpt:
          c.description.length > FEED_EXCERPT_MAX
            ? `${c.description.slice(0, FEED_EXCERPT_MAX).trimEnd()}…`
            : c.description,
        practiceArea: {
          id: leaf.id,
          code: leaf.code,
          i18nKey: leaf.i18n_key,
          nameEn: leaf.name_en,
          categoryId: category.id,
          categoryCode: category.code,
          categoryI18nKey: category.i18n_key,
          categoryNameEn: category.name_en,
        },
        extraPracticeCount: c._count?.extra_practices ?? 0,
        primaryStateCode: c.primary_state_code,
        additionalStateCodes: c.states
          .filter((s) => !s.is_primary)
          .map((s) => s.state_code),
        city: c.city,
        status: c.status,
        budget: {
          mode: c.budget_mode,
          amountCents: c.budget_cents,
          percentBps: c.budget_percent_bps,
        },
        coverKey: c.cover_key,
        ...urgencyFields(c, new Date(now), thresholds),
        viewCount: c.view_count,
        bidsCount: c.bids_count,
        createdAt: c.created_at.toISOString(),
        isNew:
          now - c.created_at.getTime() < CASE_NEW_BADGE_HOURS * 60 * 60 * 1000,
        hasOwnBid: bidCaseIds.has(c.id),
        commentCount: Math.max(
          0,
          c.comment_count + (pendingComments.get(c.id) ?? 0),
        ),
        isSaved: savedIds.has(c.id),
        shareCount: Math.max(0, c.share_count + (pendingShares.get(c.id) ?? 0)),
        promoted: promoted.has(c.id),
        promotedUntil: promotedEnds.get(c.id)?.toISOString() ?? null,
        priorityClient: priorityClients.has(c.client_id),
        clientActivity: activity.get(c.client_id) ?? null,
        dossier: {
          imagesCount: files.get(c.id)?.images ?? 0,
          documentsCount: files.get(c.id)?.documents ?? 0,
          descriptionLength: c.description.length,
          privateDetailsLength: c.private_details?.length ?? 0,
        },
      });
    }
    return items;
  }

  /** Owner 2026-10-18 (OQ-054): the card's «В сети / Был …» data, only for
   * clients whose activity status is shown to this attorney. Best effort:
   * none on any error. */
  private async activityOf(
    attorneyId: string,
    clientIds: string[],
  ): Promise<Map<string, ClientActivityView>> {
    if (!this.clientActivity) return new Map();
    try {
      return await this.clientActivity.forClients(attorneyId, clientIds);
    } catch {
      return new Map();
    }
  }

  /** Owner 2026-10-05: which of these clients are on a plan with "cases
   * shown first". Best effort: an empty set on any error. */
  private async priorityClientIds(clientIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(clientIds)];
    if (ids.length === 0) return new Set();
    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM users u
        WHERE u.id = ANY(${ids}::UUID[])
          AND ${clientsWithEntitlementSql('priority_feed', Prisma.sql`u.id`)}`;
      return new Set(rows.map((r) => r.id));
    } catch {
      return new Set();
    }
  }

  /** caseId → the end of its running promotion (best effort). */
  private async activePromotedEnds(ids: string[]): Promise<Map<string, Date>> {
    const out = new Map<string, Date>();
    if (ids.length === 0) return out;
    try {
      const now = new Date();
      const rows = await this.prisma.casePromotion.findMany({
        where: {
          status: 'active',
          starts_at: { lte: now },
          ends_at: { gt: now },
          case_id: { in: ids },
        },
        select: { case_id: true, ends_at: true },
      });
      for (const r of rows)
        if (r.case_id && r.ends_at) out.set(r.case_id, r.ends_at);
    } catch {
      // The badge just loses its date.
    }
    return out;
  }

  /** Cases with a running paid/granted promotion (owner 2026-10-02),
   * optionally limited to [ids]. Best effort: [] on any error. */
  async activePromotedCaseIds(ids?: string[]): Promise<string[]> {
    if (ids && ids.length === 0) return [];
    try {
      const now = new Date();
      const rows = await this.prisma.casePromotion.findMany({
        where: {
          status: 'active',
          starts_at: { lte: now },
          ends_at: { gt: now },
          ...(ids ? { case_id: { in: ids } } : {}),
        },
        select: { case_id: true },
        orderBy: { starts_at: 'asc' },
        take: 200,
      });
      return [...new Set(rows.flatMap((r) => (r.case_id ? [r.case_id] : [])))];
    } catch {
      return [];
    }
  }

  /** Fire-and-forget impression counter for promoted cases shown. */
  private countImpressions(caseIds: string[]): void {
    const now = new Date();
    void Promise.resolve()
      .then(() =>
        this.prisma.casePromotion.updateMany({
          where: {
            case_id: { in: caseIds },
            status: 'active',
            starts_at: { lte: now },
            ends_at: { gt: now },
          },
          data: { impressions: { increment: 1 } },
        }),
      )
      .catch(() => undefined);
  }
}

/** "for you" cursor: a position in the ranked list. */
function encodeRankedOffset(i: number): string {
  return Buffer.from(JSON.stringify({ i })).toString('base64url');
}

function rankedOffset(raw: string | undefined): number {
  if (!raw) return 0;
  try {
    const { i } = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as {
      i?: unknown;
    };
    if (typeof i === 'number' && Number.isInteger(i) && i >= 0) return i;
  } catch {
    // fall through to the first page
  }
  return 0;
}
