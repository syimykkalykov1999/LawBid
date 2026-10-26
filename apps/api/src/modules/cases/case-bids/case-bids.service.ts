import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { parseUpdatedSince, syncedAt } from '../../../common/sync/sync.util';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import { caseNotFound } from '../domain/case-state-machine';
import { CaseAccessPolicy } from '../policies/case-access.policy';
import { touchClientActive } from '../domain/client-activity';
import {
  afterScoreCursor,
  bestMatchScore,
  isSuspiciouslyLow,
  priceContext,
  ratingScore,
  sortByScore,
  type RankBid,
  type RankSettings,
} from './bid-ranking';
import {
  CASE_BIDS_PAGE_DEFAULT,
  CASE_BIDS_SORTS,
  type BidAttorneySummaryDto,
  type CaseBidItemDto,
  type CaseBidPage,
  type CaseBidsQueryDto,
  type CaseBidsSort,
} from './dto/case-bids.dto';

/** The most bids one delta answer carries (a case never has this many). */
export const CASE_BIDS_DELTA_MAX = 200;

/** Sorts the database orders; the others are scored in memory. */
type DbSort = 'newest' | 'lowest_price';
const isDbSort = (sort: CaseBidsSort): sort is DbSort =>
  sort === 'newest' || sort === 'lowest_price';

/** A case has few bids; scored sorts rank at most this many. */
const SCORED_BIDS_MAX = 500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque keyset cursor of the bid list: the sort it belongs to, the last
 * row's sort key and id. */
export interface BidListCursor {
  sort: CaseBidsSort;
  key: string;
  id: string;
}

export function encodeBidListCursor(cursor: BidListCursor): string {
  return Buffer.from(
    JSON.stringify({ s: cursor.sort, k: cursor.key, id: cursor.id }),
  ).toString('base64url');
}

/** Throws 400 VALIDATION_ERROR (details.field = 'cursor') for anything
 * that is not a cursor this list issued for the same sort. */
export function decodeBidListCursor(
  raw: string,
  sort: CaseBidsSort,
): BidListCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const { s, k, id } = parsed as { s?: unknown; k?: unknown; id?: unknown };
      if (
        s === sort &&
        typeof k === 'string' &&
        typeof id === 'string' &&
        UUID_RE.test(id)
      ) {
        return { sort, key: k, id };
      }
    }
  } catch {
    // Fall through to the validation error below.
  }
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Invalid cursor.',
    details: { field: 'cursor' },
  });
}

export const BID_LIST_INCLUDE = {
  attorney: {
    select: {
      first_name: true,
      last_name: true,
      avatar_file_id: true,
      attorney_profile: {
        select: {
          username: true,
          verification_status: true,
          name_mismatch: true,
          trust_level: true,
          trust_badge: true,
          rating_avg: true,
          rating_count: true,
          licenses: {
            where: { license_status: 'verified' },
            select: { state_code: true },
            orderBy: { state_code: 'asc' },
          },
        },
      },
    },
  },
} satisfies Prisma.BidInclude;

export type BidListRow = Prisma.BidGetPayload<{
  include: typeof BID_LIST_INCLUDE;
}>;

/**
 * docs/04 §5.2 (stage 4.5): GET /cases/:id/bids — the case owner's list
 * of bids with the attorney's public summary. Owner only (CaseAccessPolicy,
 * deny by default); attorneys never get this list — a case's bids are the
 * client's business, and an attorney sees only their own via GET /bids/:id.
 */
@Injectable()
export class CaseBidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseAccess: CaseAccessPolicy,
    private readonly files: FilesService,
    private readonly settings: AppSettingsService,
  ) {}

  private readonly logger = new Logger(CaseBidsService.name);

  private async rankSettings(): Promise<RankSettings> {
    const [rating, trust, speed, price, completed, prior, weight, low, min] =
      await Promise.all([
        this.settings.number('bids.best_match.rating'),
        this.settings.number('bids.best_match.trust'),
        this.settings.number('bids.best_match.speed'),
        this.settings.number('bids.best_match.price'),
        this.settings.number('bids.best_match.completed'),
        this.settings.number('bids.bayes_prior'),
        this.settings.number('bids.bayes_weight'),
        this.settings.number('bids.low_ratio'),
        this.settings.number('bids.min_bids_for_price'),
      ]);
    const nn = (x: number): number => (x > 0 ? x : 0);
    return {
      weights: {
        rating: nn(rating),
        trust: nn(trust),
        speed: nn(speed),
        price: nn(price),
        completed: nn(completed),
      },
      bayesPrior: prior,
      bayesWeight: nn(weight),
      lowRatio: nn(low),
      minBidsForPrice: Math.max(2, Math.floor(min)),
    };
  }

  /** The sort of a request: its own, else the admin default (a bad
   * stored value falls back to newest). */
  private async sortOf(requested?: CaseBidsSort): Promise<CaseBidsSort> {
    if (requested) return requested;
    const d = await this.settings.string('bids.default_sort');
    return (CASE_BIDS_SORTS as readonly string[]).includes(d)
      ? (d as CaseBidsSort)
      : 'newest';
  }

  /** §11.1 "Адвокат в работе": the accepted bid of the owner's case. */
  async acceptedFor(
    acceptedBidId: string | null,
  ): Promise<CaseBidItemDto | null> {
    if (!acceptedBidId) return null;
    const bid = await this.prisma.bid.findUnique({
      where: { id: acceptedBidId },
      include: BID_LIST_INCLUDE,
    });
    return bid ? this.toItem(bid) : null;
  }

  async list(
    user: RequestUser,
    caseId: string,
    query: CaseBidsQueryDto,
  ): Promise<CaseBidPage> {
    if (user.role !== 'client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the case owner can list its bids.',
      });
    }
    const access = await this.caseAccess.decide(
      { userId: user.sub, role: 'client' },
      caseId,
    );
    if (access?.kind !== 'owner') throw caseNotFound();
    // OQ-054: viewing its bids is the client's own action on the case.
    await touchClientActive(this.prisma, caseId, user.sub);

    // Owner 2026-10-22 (delta audit D-P4, Telegram): only the bids changed
    // since (a counter, accept, withdraw …); a bid never leaves this list,
    // so deletedIds is empty and meta.syncedAt moves the client forward.
    const since = parseUpdatedSince(query.updatedSince);
    const sort = await this.sortOf(query.sort);
    const limit = query.limit ?? CASE_BIDS_PAGE_DEFAULT;
    const cursor = query.cursor
      ? decodeBidListCursor(query.cursor, sort)
      : null;
    const [rs, guard, priceRows] = await Promise.all([
      this.rankSettings(),
      this.settings.boolean('bids.dumping_guard'),
      this.prisma.bid.findMany({
        where: { case_id: caseId },
        select: {
          id: true,
          fee_type: true,
          amount_cents: true,
          percent_bps: true,
          status: true,
          created_at: true,
        },
        take: SCORED_BIDS_MAX,
      }),
    ]);
    const ctx = priceContext(
      priceRows.map((r) => ({
        id: r.id,
        feeType: r.fee_type,
        amountCents: r.amount_cents,
        percentBps: r.percent_bps,
        status: r.status,
        createdAtMs: r.created_at.getTime(),
        ratingAvg: 0,
        ratingCount: 0,
        trustLevel: 0,
        completedCases: 0,
      })),
      rs,
    );
    const byId = new Map(priceRows.map((r) => [r.id, r]));
    const withFlags = (r: BidListRow) => {
      const pr = byId.get(r.id);
      const low =
        guard &&
        pr !== undefined &&
        isSuspiciouslyLow(toRankBid(r, 0), ctx, rs);
      if (low) {
        this.logger.warn(
          `Dumping guard: bid ${r.id} on case ${caseId} is far below the median price; review.`,
        );
      }
      return this.toItem(r, {
        bestPrice: ctx.bestPriceId === r.id,
        lowOffer: low,
      });
    };

    if (since) {
      const changed = await this.prisma.bid.findMany({
        where: { case_id: caseId, updated_at: { gte: since } },
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        take: CASE_BIDS_DELTA_MAX,
        include: BID_LIST_INCLUDE,
      });
      return {
        items: await Promise.all(changed.map(withFlags)),
        nextCursor: null,
        deletedIds: [],
        syncedAt: syncedAt(
          changed.map((r) => r.updated_at),
          since,
        ),
      };
    }

    let page: BidListRow[];
    let nextCursor: string | null = null;
    if (isDbSort(sort)) {
      const rows = await this.prisma.bid.findMany({
        where: { case_id: caseId, ...(cursor ? afterCursor(cursor) : {}) },
        orderBy: orderOf(sort),
        take: limit + 1,
        include: BID_LIST_INCLUDE,
      });
      page = rows.slice(0, limit);
      const last = page[page.length - 1];
      if (rows.length > limit && last) {
        nextCursor = encodeBidListCursor({
          sort,
          key: keyOf(sort, last),
          id: last.id,
        });
      }
    } else {
      const [rows, kase] = await Promise.all([
        this.prisma.bid.findMany({
          where: { case_id: caseId },
          include: BID_LIST_INCLUDE,
          take: SCORED_BIDS_MAX,
        }),
        this.prisma.case.findUnique({
          where: { id: caseId },
          select: { created_at: true },
        }),
      ]);
      const completed =
        sort === 'best_match'
          ? await this.completedCases(rows.map((r) => r.attorney_id))
          : new Map<string, number>();
      const caseMs = kase?.created_at.getTime() ?? 0;
      const score = new Map<string, number>();
      for (const r of rows) {
        const rb = toRankBid(r, completed.get(r.attorney_id) ?? 0);
        score.set(
          r.id,
          sort === 'best_match'
            ? bestMatchScore(rb, caseMs, ctx, rs)
            : Math.round(ratingScore(rb, rs) * 1e6) / 1e6,
        );
      }
      const scoreOf = (r: BidListRow): number => score.get(r.id) ?? 0;
      let ordered = sortByScore(rows, scoreOf);
      if (cursor) {
        const key = Number(cursor.key);
        if (!Number.isFinite(key)) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid cursor.',
            details: { field: 'cursor' },
          });
        }
        ordered = afterScoreCursor(ordered, scoreOf, key, cursor.id);
      }
      page = ordered.slice(0, limit);
      const last = page[page.length - 1];
      if (ordered.length > limit && last) {
        nextCursor = encodeBidListCursor({
          sort,
          key: String(scoreOf(last)),
          id: last.id,
        });
      }
    }

    const items = await Promise.all(page.map(withFlags));
    return { items, nextCursor };
  }

  /** Attorney id → cases finished through LawBid (accepted bid, closed). */
  private async completedCases(
    attorneyIds: string[],
  ): Promise<Map<string, number>> {
    if (attorneyIds.length === 0) return new Map();
    const rows = await this.prisma.bid.groupBy({
      by: ['attorney_id'],
      where: {
        attorney_id: { in: attorneyIds },
        accepted_for_case: { is: { status: 'closed' } },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.attorney_id, r._count._all]));
  }

  /** A bid with the attorney's public summary (§5.2 card). */
  async toItem(
    bid: BidListRow,
    flags: { bestPrice: boolean; lowOffer: boolean } = {
      bestPrice: false,
      lowOffer: false,
    },
  ): Promise<CaseBidItemDto> {
    const a = bid.attorney;
    const avatar = await this.files.avatarUrls(a.avatar_file_id);
    return {
      id: bid.id,
      caseId: bid.case_id,
      attorneyId: bid.attorney_id,
      status: bid.status,
      feeType: bid.fee_type,
      amountCents: bid.amount_cents,
      percentBps: bid.percent_bps,
      message: bid.message,
      startAvailability: bid.start_availability,
      startDate: bid.start_date
        ? bid.start_date.toISOString().slice(0, 10)
        : null,
      estimatedDurationDays: bid.estimated_duration_days,
      roundCount: bid.round_count,
      version: bid.version,
      turn: bid.turn,
      outsidePractice: bid.outside_practice,
      outsideLicensedStates: bid.outside_licensed_states,
      decidedAt: bid.decided_at?.toISOString() ?? null,
      createdAt: bid.created_at.toISOString(),
      attorney: toAttorneySummary(bid.attorney_id, a, avatar.url256),
      bestPrice: flags.bestPrice,
      lowOffer: flags.lowOffer,
    };
  }

  /** GET /bids/:id: the attorney summary of one bid (the caller has
   * already checked that the viewer is one of the bid's parties). */
  async attorneySummaryOf(
    bidId: string,
  ): Promise<BidAttorneySummaryDto | undefined> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: BID_LIST_INCLUDE,
    });
    if (!bid) return undefined;
    const avatar = await this.files.avatarUrls(bid.attorney.avatar_file_id);
    return toAttorneySummary(bid.attorney_id, bid.attorney, avatar.url256);
  }
}

/** The attorney's public summary on a bid / invite card (§5.2). */
export function toAttorneySummary(
  attorneyId: string,
  a: BidListRow['attorney'],
  avatarUrl256: string | null,
): BidAttorneySummaryDto {
  const p = a.attorney_profile;
  return {
    id: attorneyId,
    username: p?.username ?? '',
    firstName: a.first_name,
    lastName: a.last_name,
    avatarUrl256,
    verifiedBadge: p?.trust_badge ?? false,
    trustLevel: p?.trust_level ?? 0,
    licensedStates: [...new Set((p?.licenses ?? []).map((l) => l.state_code))],
    rating: {
      avg: p ? Number(p.rating_avg) : 0,
      count: p?.rating_count ?? 0,
    },
  };
}

function toRankBid(row: BidListRow, completedCases: number): RankBid {
  const p = row.attorney.attorney_profile;
  return {
    id: row.id,
    feeType: row.fee_type,
    amountCents: row.amount_cents,
    percentBps: row.percent_bps,
    status: row.status,
    createdAtMs: row.created_at.getTime(),
    ratingAvg: p ? Number(p.rating_avg) : 0,
    ratingCount: p?.rating_count ?? 0,
    trustLevel: p?.trust_level ?? 0,
    completedCases,
  };
}

function orderOf(sort: DbSort): Prisma.BidOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ created_at: 'desc' }, { id: 'desc' }];
    case 'lowest_price':
      return [{ amount_cents: 'asc' }, { id: 'asc' }];
  }
}

function keyOf(sort: DbSort, row: BidListRow): string {
  switch (sort) {
    case 'newest':
      return row.created_at.toISOString();
    case 'lowest_price':
      return String(row.amount_cents);
  }
}

/** Keyset predicate continuing `orderOf(sort)` after the cursor row. */
function afterCursor(cursor: BidListCursor): Prisma.BidWhereInput {
  switch (cursor.sort) {
    case 'newest': {
      const t = new Date(cursor.key);
      if (Number.isNaN(t.getTime())) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid cursor.',
          details: { field: 'cursor' },
        });
      }
      return {
        OR: [
          { created_at: { lt: t } },
          { created_at: t, id: { lt: cursor.id } },
        ],
      };
    }
    case 'lowest_price': {
      const amount = Number(cursor.key);
      if (!Number.isInteger(amount)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid cursor.',
          details: { field: 'cursor' },
        });
      }
      return {
        OR: [
          { amount_cents: { gt: amount } },
          { amount_cents: amount, id: { gt: cursor.id } },
        ],
      };
    }
    default:
      // Scored sorts page in memory (see list()).
      return {};
  }
}
