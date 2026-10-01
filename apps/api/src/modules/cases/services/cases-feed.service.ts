import { CasePhotosService } from './case-photos.service';
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
import {
  buildPracticeCasesSql,
  buildVisibleCasesSql,
} from '../queries/cases-visible.sql';
import { CaseViewTrackingService } from './case-view-tracking.service';

type CaseWithPracticeArea = Case & {
  practice_area: PracticeArea & { parent: PracticeArea | null };
  states: { state_code: string; is_primary: boolean }[];
};

const CASE_WITH_PRACTICE_AREA_INCLUDE = {
  practice_area: { include: { parent: true } },
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
const FEED_EXCERPT_MAX = 180;

@Injectable()
export class CasesFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessPolicy,
    private readonly viewTracking: CaseViewTrackingService,
    private readonly posts: PostEngagementService,
    @Optional() private readonly photos?: CasePhotosService,
    @Optional() private readonly counters?: CounterAggregator,
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
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

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
    const extra = Prisma.sql`
      ${query.budgetMin !== undefined ? Prisma.sql`AND c.budget_cents >= ${query.budgetMin * 100}` : Prisma.empty}
      ${query.budgetMax !== undefined ? Prisma.sql`AND c.budget_cents <= ${query.budgetMax * 100}` : Prisma.empty}
      ${query.budgetUnknown ? Prisma.sql`AND c.budget_mode = 'clarify_later'` : Prisma.empty}
      ${query.noBids ? Prisma.sql`AND c.bids_count = 0` : Prisma.empty}`;
    const rows = await this.prisma.$queryRaw<
      { id: string; created_at: Date }[]
    >(
      query.practice
        ? buildPracticeCasesSql({
            attorneyId: viewer.userId,
            practice: query.practice,
            state: query.state,
            cursor,
            limit: limit + 1,
            since,
            extra,
          })
        : buildVisibleCasesSql({
            attorneyId: viewer.userId,
            practiceAreaId: query.practiceAreaId,
            practiceCategory: query.practiceCategory,
            state: query.state,
            cursor,
            limit: limit + 1,
            since,
            extra,
          }),
    );
    const page = rows.slice(0, limit);
    const items = await this.hydrate(
      page.map((r) => r.id),
      viewer.userId,
    );
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
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
        select: { description: true },
      }),
      this.prisma.savedItem.findFirst({
        where: { user_id: attorneyId, item_type: 'case', item_id: caseId },
        select: { user_id: true },
      }),
      this.prisma.bid.findUnique({
        where: {
          case_id_attorney_id: { case_id: caseId, attorney_id: attorneyId },
        },
        select: { id: true },
      }),
    ]);
    const media = this.photos
      ? await this.photos.forViewer(caseId, attorneyId)
      : { photos: [], photosCount: 0 };
    return {
      ...item,
      description: row.description,
      isSaved: !!saved,
      ownBidId: ownBid?.id ?? null,
      ...media,
      inMyPractice: access.inPractice,
    };
  }

  /** POST /cases/:id/view (docs/04 §4.3): dedup + batched counter. The
   * attorney must currently be able to see the case. */
  async recordView(attorneyId: string, caseId: string): Promise<void> {
    await this.access.assertVisibleToAttorney(attorneyId, caseId);
    await this.viewTracking.recordView(attorneyId, caseId);
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
    const [rows, ownBids, saved, pendingComments, pendingShares] =
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
      ]);
    const bidCaseIds = new Set(ownBids.map((b) => b.case_id));
    const savedIds = new Set(saved.map((s) => s.item_id));
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
        primaryStateCode: c.primary_state_code,
        additionalStateCodes: c.states
          .filter((s) => !s.is_primary)
          .map((s) => s.state_code),
        city: c.city,
        status: c.status,
        budget: { mode: c.budget_mode, amountCents: c.budget_cents },
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
      });
    }
    return items;
  }
}
