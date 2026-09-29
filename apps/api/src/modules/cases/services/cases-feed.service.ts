import {
  ForbiddenException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import type { Case, PracticeArea } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
} from '../../../common/pagination/cursor.util';
import { ErrorCode } from '../../../common/errors/error-code.enum';
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
import { buildVisibleCasesSql } from '../queries/cases-visible.sql';
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
@Injectable()
export class CasesFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessPolicy,
    private readonly viewTracking: CaseViewTrackingService,
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

    const rows = await this.prisma.$queryRaw<
      { id: string; created_at: Date }[]
    >(
      buildVisibleCasesSql({
        attorneyId: viewer.userId,
        practiceAreaId: query.practiceAreaId,
        state: query.state,
        cursor,
        limit: limit + 1,
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
    await this.access.assertVisibleToAttorney(attorneyId, caseId);
    const [item] = await this.hydrate([caseId], attorneyId);
    // The access check and the hydrate read are not in the same
    // transaction; a case deleted/closed/moved in between is possible but
    // vanishingly unlikely — still handled, not left as a 500.
    if (!item) throw caseNotAvailable();
    const [row, saved] = await Promise.all([
      this.prisma.case.findUniqueOrThrow({
        where: { id: caseId },
        select: { description: true },
      }),
      this.prisma.savedItem.findFirst({
        where: { user_id: attorneyId, item_type: 'case', item_id: caseId },
        select: { user_id: true },
      }),
    ]);
    return { ...item, description: row.description, isSaved: !!saved };
  }

  /** POST /cases/:id/view (docs/04 §4.3): dedup + batched counter. The
   * attorney must currently be able to see the case. */
  async recordView(attorneyId: string, caseId: string): Promise<void> {
    await this.access.assertVisibleToAttorney(attorneyId, caseId);
    await this.viewTracking.recordView(attorneyId, caseId);
  }

  /** POST /saved-items (docs/04 §4.3 "Сохранить", §11.2, §15). Only
   * itemType 'case' is implemented in stage 4.3; only an attorney with
   * current visibility on the case can save it (§4.3 button only appears
   * there); 'post' arrives with file 05. */
  async save(viewer: CaseViewer, dto: SavedItemDto): Promise<void> {
    if (dto.itemType !== 'case') this.notImplementedPost();
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
    if (dto.itemType !== 'case') this.notImplementedPost();
    await this.prisma.savedItem.deleteMany({
      where: {
        user_id: viewer.userId,
        item_type: 'case',
        item_id: dto.itemId,
      },
    });
  }

  private notImplementedPost(): never {
    throw new NotImplementedException({
      code: ErrorCode.NOT_IMPLEMENTED,
      message: 'Saving posts arrives with file 05.',
    });
  }

  private async isVerifiedAttorney(attorneyId: string): Promise<boolean> {
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
    const [rows, ownBids] = await Promise.all([
      this.prisma.case.findMany({
        where: { id: { in: ids } },
        include: CASE_WITH_PRACTICE_AREA_INCLUDE,
      }) as Promise<CaseWithPracticeArea[]>,
      this.prisma.bid.findMany({
        where: { attorney_id: attorneyId, case_id: { in: ids } },
        select: { case_id: true },
      }),
    ]);
    const bidCaseIds = new Set(ownBids.map((b) => b.case_id));
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
      });
    }
    return items;
  }
}
