import { CasePhotosService } from '../services/case-photos.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type {
  Bid,
  BidStatus,
  CaseStatus,
  ConversationStatus,
  Prisma,
} from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../../common/pagination/cursor.util';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { SubscriptionAccessService } from '../../subscriptions/subscription-access.service';
import { CaseBidsService } from '../case-bids/case-bids.service';
import { CasesService } from '../cases.service';
import { caseNotFound } from '../domain/case-state-machine';
import {
  CaseAccessPolicy,
  caseNotAvailable,
} from '../policies/case-access.policy';
import { CasesFeedService } from '../services/cases-feed.service';
import {
  MINE_PAGE_DEFAULT,
  type CaseConversationDto,
  type MyBidItemDto,
  type MyBidsFilter,
  type MyWorkFilter,
  type OwnerCaseDetailDto,
  type Page,
  type SavedCaseItemDto,
  type WorkItemDto,
} from './dto/mine.dto';

const FINISHED_BIDS: BidStatus[] = [
  'accepted',
  'rejected_by_client',
  'rejected_auto',
  'withdrawn',
  'failed_negotiation',
];
const WORK_STATUSES: Record<MyWorkFilter, CaseStatus[]> = {
  active: ['in_progress', 'pending_completion', 'disputed'],
  closed: ['closed'],
};

function forbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });
}

function keyset(cursor?: string): Prisma.BidWhereInput {
  if (!cursor) return {};
  const c = decodeCursor(cursor);
  return {
    OR: [
      { updated_at: { lt: c.createdAt } },
      { updated_at: c.createdAt, id: { lt: c.id } },
    ],
  };
}

/**
 * docs/04 §11 "Моё" and §15 list/support routes for the app (stages
 * 4.9/4.10): the owner's case detail, "Мои биды", "В работе", saved cases,
 * and "Написать клиенту" (the pre-acceptance conversation, §9).
 */
@Injectable()
export class MineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly caseBids: CaseBidsService,
    private readonly feed: CasesFeedService,
    private readonly access: CaseAccessPolicy,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly photos: CasePhotosService,
  ) {}

  /** GET /users/me/cases/:id (owner only; deleted cases are 404). */
  async ownerCase(
    user: RequestUser,
    caseId: string,
  ): Promise<OwnerCaseDetailDto> {
    if (user.role !== 'client') throw caseNotFound();
    const kase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!kase || kase.client_id !== user.sub) throw caseNotFound();
    const [dto, acceptedBid, conversation, media] = await Promise.all([
      this.cases.toFullDto(kase),
      this.caseBids.acceptedFor(kase.accepted_bid_id),
      kase.accepted_bid_id
        ? this.prisma.conversation.findFirst({
            where: { case_id: caseId, bid_id: kase.accepted_bid_id },
            select: { id: true },
          })
        : null,
      this.photos.forViewer(caseId, user.sub),
    ]);
    return {
      ...dto,
      acceptedBid,
      conversationId: conversation?.id ?? null,
      photos: media.photos,
    };
  }

  /** GET /users/me/bids?filter= — newest activity first (index
   * bids(attorney_id, status, updated_at DESC)). */
  async myBids(
    user: RequestUser,
    filter: MyBidsFilter,
    cursor: string | undefined,
    limit = MINE_PAGE_DEFAULT,
  ): Promise<Page<MyBidItemDto>> {
    if (user.role !== 'attorney') throw forbidden('Attorneys only.');
    const rows = await this.prisma.bid.findMany({
      where: {
        attorney_id: user.sub,
        status: filter === 'active' ? 'active' : { in: FINISHED_BIDS },
        ...keyset(cursor),
      },
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        case: {
          select: {
            id: true,
            title: true,
            status: true,
            primary_state_code: true,
            practice_area: {
              select: { name_en: true, i18n_key: true, code: true },
            },
          },
        },
        offers: { orderBy: { round_no: 'desc' }, take: 1 },
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((b) => ({
        ...bidFields(b),
        case: {
          id: b.case.id,
          title: b.case.title,
          status: b.case.status,
          primaryStateCode: b.case.primary_state_code,
          practiceAreaNameEn: b.case.practice_area.name_en,
          practiceAreaI18nKey: b.case.practice_area.i18n_key,
          practiceAreaCode: b.case.practice_area.code,
        },
        lastOffer: offerFields(b.offers[0], b),
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.updated_at, id: last.id })
          : null,
    };
  }

  /** GET /users/me/work?filter= — cases where the attorney's bid was
   * accepted. The client's name follows the §8.3 subscription gate. */
  async myWork(
    user: RequestUser,
    filter: MyWorkFilter,
    cursor: string | undefined,
    limit = MINE_PAGE_DEFAULT,
  ): Promise<Page<WorkItemDto>> {
    if (user.role !== 'attorney') throw forbidden('Attorneys only.');
    const c = cursor ? decodeCursor(cursor) : undefined;
    // From the attorney's accepted bids — index bids(attorney_id, status,
    // updated_at) — rather than scanning cases (load review, file 04).
    const [bids, active] = await Promise.all([
      this.prisma.bid.findMany({
        where: {
          attorney_id: user.sub,
          status: 'accepted',
          accepted_for_case: { status: { in: WORK_STATUSES[filter] } },
          ...(c
            ? {
                OR: [
                  { updated_at: { lt: c.createdAt } },
                  { updated_at: c.createdAt, id: { lt: c.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          fee_type: true,
          amount_cents: true,
          decided_at: true,
          updated_at: true,
          accepted_for_case: {
            select: {
              id: true,
              title: true,
              status: true,
              auto_close_at: true,
              closed_at: true,
              primary_state_code: true,
              practice_area: {
                select: { name_en: true, i18n_key: true, code: true },
              },
              client: { select: { first_name: true, last_name: true } },
            },
          },
        },
      }),
      this.subscriptions.isActive(user.sub),
    ]);
    const page = bids.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.flatMap((b) => {
        const k = b.accepted_for_case;
        if (!k) return [];
        return [
          {
            caseId: k.id,
            bidId: b.id,
            title: k.title,
            status: k.status,
            primaryStateCode: k.primary_state_code,
            practiceAreaNameEn: k.practice_area.name_en,
            practiceAreaI18nKey: k.practice_area.i18n_key,
            practiceAreaCode: k.practice_area.code,
            clientName: active
              ? [k.client.first_name, k.client.last_name]
                  .filter(Boolean)
                  .join(' ') || null
              : null,
            feeType: b.fee_type,
            amountCents: b.amount_cents,
            autoCloseAt: k.auto_close_at?.toISOString() ?? null,
            acceptedAt: b.decided_at?.toISOString() ?? null,
            closedAt: k.closed_at?.toISOString() ?? null,
          },
        ];
      }),
      nextCursor:
        bids.length > limit && last
          ? encodeCursor({ createdAt: last.updated_at, id: last.id })
          : null,
    };
  }

  /** GET /saved-items?type=case — an available case is shown as a feed
   * card; a closed or no-longer-visible one as "Кейс недоступен". */
  async savedCases(
    user: RequestUser,
    cursor: string | undefined,
    limit = MINE_PAGE_DEFAULT,
  ): Promise<Page<SavedCaseItemDto>> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.savedItem.findMany({
      where: {
        user_id: user.sub,
        item_type: 'case',
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, item_id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { item_id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const ids = page.map((r) => r.item_id);
    const visible =
      user.role === 'attorney'
        ? await this.access.visibleCaseIds(user.sub, ids)
        : new Set<string>();
    const [cards, titles] = await Promise.all([
      user.role === 'attorney' ? this.feed.hydrate([...visible], user.sub) : [],
      this.prisma.case.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      }),
    ]);
    const cardById = new Map(cards.map((k) => [k.id, k]));
    const titleById = new Map(titles.map((k) => [k.id, k.title]));
    const last = page[page.length - 1];
    return {
      items: page.map((r) => {
        const card = cardById.get(r.item_id) ?? null;
        const available = !!card && card.status === 'open';
        return {
          caseId: r.item_id,
          savedAt: r.created_at.toISOString(),
          available,
          title: titleById.get(r.item_id) ?? null,
          case: available ? card : null,
        };
      }),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.item_id })
          : null,
    };
  }

  /** POST /cases/:id/conversation — "Написать клиенту" (§9 rule 2): an
   * attorney who can see the case, with an active subscription/trial,
   * opens (or reopens) the one conversation per (case, attorney). */
  async openConversation(
    user: RequestUser,
    caseId: string,
  ): Promise<CaseConversationDto> {
    if (user.role !== 'attorney') throw forbidden('Attorneys only.');
    const decision = await this.access.decide(
      { userId: user.sub, role: 'attorney' },
      caseId,
    );
    if (!decision) throw caseNotAvailable();
    if (!(await this.subscriptions.isActive(user.sub))) {
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message:
          'An active subscription or trial is required to message a client.',
      });
    }
    const existing = await this.prisma.conversation.findUnique({
      where: {
        case_id_attorney_id: { case_id: caseId, attorney_id: user.sub },
      },
      select: { id: true, status: true, contacts_unlocked: true },
    });
    if (existing) return toConversation(existing);
    const kase = await this.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { client_id: true, status: true },
    });
    // §9: a new pre-acceptance chat only on an open case.
    if (kase.status !== 'open') {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'Messaging is available only while the case is open.',
        details: { status: kase.status },
      });
    }
    try {
      const created = await this.prisma.conversation.create({
        data: {
          case_id: caseId,
          attorney_id: user.sub,
          client_id: kase.client_id,
          status: 'pre_acceptance',
          contacts_unlocked: false,
          participants: {
            create: [{ user_id: kase.client_id }, { user_id: user.sub }],
          },
        },
        select: { id: true, status: true, contacts_unlocked: true },
      });
      return toConversation(created);
    } catch (error) {
      // A concurrent tap created it first (UQ case_id + attorney_id).
      const again = await this.prisma.conversation.findUnique({
        where: {
          case_id_attorney_id: { case_id: caseId, attorney_id: user.sub },
        },
        select: { id: true, status: true, contacts_unlocked: true },
      });
      if (again) return toConversation(again);
      throw error;
    }
  }
}

function toConversation(c: {
  id: string;
  status: ConversationStatus;
  contacts_unlocked: boolean;
}): CaseConversationDto {
  return {
    conversationId: c.id,
    status: c.status,
    contactsUnlocked: c.contacts_unlocked,
  };
}

function bidFields(b: Bid) {
  return {
    id: b.id,
    caseId: b.case_id,
    attorneyId: b.attorney_id,
    status: b.status,
    feeType: b.fee_type,
    amountCents: b.amount_cents,
    message: b.message,
    startAvailability: b.start_availability,
    startDate: b.start_date ? b.start_date.toISOString().slice(0, 10) : null,
    estimatedDurationDays: b.estimated_duration_days,
    roundCount: b.round_count,
    turn: b.turn,
    decidedAt: b.decided_at?.toISOString() ?? null,
    createdAt: b.created_at.toISOString(),
  };
}

function offerFields(o: Prisma.BidOfferGetPayload<object> | undefined, b: Bid) {
  return o
    ? {
        id: o.id,
        roundNo: o.round_no,
        fromRole: o.from_role,
        feeType: o.fee_type,
        amountCents: o.amount_cents,
        message: o.message,
        status: o.status,
        createdAt: o.created_at.toISOString(),
      }
    : {
        id: b.id,
        roundNo: 0,
        fromRole: 'attorney' as const,
        feeType: b.fee_type,
        amountCents: b.amount_cents,
        message: b.message,
        status: 'pending' as const,
        createdAt: b.created_at.toISOString(),
      };
}
