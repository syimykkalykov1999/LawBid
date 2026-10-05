import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import { caseNotFound } from '../domain/case-state-machine';
import { CaseAccessPolicy } from '../policies/case-access.policy';
import {
  CASE_BIDS_PAGE_DEFAULT,
  type BidAttorneySummaryDto,
  type CaseBidItemDto,
  type CaseBidPage,
  type CaseBidsQueryDto,
  type CaseBidsSort,
} from './dto/case-bids.dto';

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
  ) {}

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

    const sort = query.sort ?? 'newest';
    const limit = query.limit ?? CASE_BIDS_PAGE_DEFAULT;
    const cursor = query.cursor
      ? decodeBidListCursor(query.cursor, sort)
      : null;
    const rows = await this.prisma.bid.findMany({
      where: { case_id: caseId, ...(cursor ? afterCursor(cursor) : {}) },
      orderBy: orderOf(sort),
      take: limit + 1,
      include: BID_LIST_INCLUDE,
    });
    const page = rows.slice(0, limit);
    const items = await Promise.all(page.map((r) => this.toItem(r)));
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeBidListCursor({ sort, key: keyOf(sort, last), id: last.id })
          : null,
    };
  }

  /** A bid with the attorney's public summary (§5.2 card). */
  async toItem(bid: BidListRow): Promise<CaseBidItemDto> {
    const a = bid.attorney;
    const avatar = await this.files.avatarUrls(a.avatar_file_id);
    return {
      id: bid.id,
      caseId: bid.case_id,
      attorneyId: bid.attorney_id,
      status: bid.status,
      feeType: bid.fee_type,
      amountCents: bid.amount_cents,
      message: bid.message,
      startAvailability: bid.start_availability,
      startDate: bid.start_date
        ? bid.start_date.toISOString().slice(0, 10)
        : null,
      estimatedDurationDays: bid.estimated_duration_days,
      roundCount: bid.round_count,
      turn: bid.turn,
      outsidePractice: bid.outside_practice,
      outsideLicensedStates: bid.outside_licensed_states,
      decidedAt: bid.decided_at?.toISOString() ?? null,
      createdAt: bid.created_at.toISOString(),
      attorney: toAttorneySummary(bid.attorney_id, a, avatar.url256),
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

function orderOf(sort: CaseBidsSort): Prisma.BidOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ created_at: 'desc' }, { id: 'desc' }];
    case 'lowest_price':
      return [{ amount_cents: 'asc' }, { id: 'asc' }];
    case 'highest_rating':
      return [
        { attorney: { attorney_profile: { rating_avg: 'desc' } } },
        { id: 'desc' },
      ];
  }
}

function keyOf(sort: CaseBidsSort, row: BidListRow): string {
  switch (sort) {
    case 'newest':
      return row.created_at.toISOString();
    case 'lowest_price':
      return String(row.amount_cents);
    case 'highest_rating':
      return row.attorney.attorney_profile?.rating_avg.toString() ?? '0';
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
    case 'highest_rating':
      return {
        OR: [
          {
            attorney: {
              attorney_profile: { is: { rating_avg: { lt: cursor.key } } },
            },
          },
          {
            attorney: { attorney_profile: { is: { rating_avg: cursor.key } } },
            id: { lt: cursor.id },
          },
        ],
      };
  }
}
