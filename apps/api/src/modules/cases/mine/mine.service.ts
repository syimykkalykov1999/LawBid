import { assertNoBlockBetween } from '../../blocks/block-check';
import {
  hasMineFilter,
  mineWhere,
  type MineFilterFields,
} from './mine-filters';
import { FilesService } from '../../files/files.service';
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
import { parseUpdatedSince, syncedAt } from '../../../common/sync/sync.util';
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
import { touchClientActive } from '../domain/client-activity';
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
    private readonly files: FilesService,
  ) {}

  /** GET /users/me/cases/:id (owner only; deleted cases are 404). */
  async ownerCase(
    user: RequestUser,
    caseId: string,
  ): Promise<OwnerCaseDetailDto> {
    if (user.role !== 'client') throw caseNotFound();
    const kase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!kase || kase.client_id !== user.sub) throw caseNotFound();
    // OQ-054: opening the case is the client's own action on it.
    await touchClientActive(this.prisma, caseId, user.sub);
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
    search: MineFilterFields = {},
    updatedSince?: string,
  ): Promise<Page<MyBidItemDto>> {
    if (user.role !== 'attorney') throw forbidden('Attorneys only.');
    // Owner 2026-10-22 (client economy plan, package E): the delta — my
    // bids whose row or case changed since; the ones outside this tab now
    // come back as deletedIds.
    const since = parseUpdatedSince(updatedSince);
    const tab: Prisma.BidWhereInput =
      filter === 'completed'
        ? {
            OR: [
              {
                status: {
                  in: FINISHED_BIDS.filter((x) => x !== 'accepted'),
                },
              },
              {
                status: 'accepted',
                case: { status: { in: ['closed', 'archived'] } },
              },
            ],
          }
        : {
            status: filter === 'active' ? 'active' : { in: FINISHED_BIDS },
          };
    const rows = await this.prisma.bid.findMany({
      where: {
        attorney_id: user.sub,
        // Owner 2026-09-30: search and filters in "Mine".
        ...(hasMineFilter(search) && !since
          ? { case: await mineWhere(this.prisma, search) }
          : {}),
        AND: since
          ? [
              {
                OR: [
                  { updated_at: { gte: since } },
                  { case: { updated_at: { gte: since } } },
                ],
              },
            ]
          : [tab, keyset(cursor)],
      },
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
      take: since ? 500 : limit + 1,
      include: {
        case: {
          select: {
            id: true,
            title: true,
            status: true,
            updated_at: true,
            primary_state_code: true,
            practice_area: {
              select: { name_en: true, i18n_key: true, code: true },
            },
          },
        },
        offers: { orderBy: { round_no: 'desc' }, take: 1 },
      },
    });
    const inTab = (b: (typeof rows)[number]) =>
      filter === 'completed'
        ? (FINISHED_BIDS.includes(b.status) && b.status !== 'accepted') ||
          (b.status === 'accepted' &&
            (b.case.status === 'closed' || b.case.status === 'archived'))
        : filter === 'active'
          ? b.status === 'active'
          : FINISHED_BIDS.includes(b.status);
    const page = since ? rows.filter(inTab) : rows.slice(0, limit);
    const last = page[page.length - 1];
    const covers = await this.photos.coverUrls(
      page.map((b) => b.case.id),
      user.sub,
    );
    return {
      ...(since
        ? {
            deletedIds: rows.filter((b) => !inTab(b)).map((b) => b.id),
            syncedAt: syncedAt(
              rows.flatMap((b) => [b.updated_at, b.case.updated_at]),
              since,
            ),
          }
        : {}),
      items: page.map((b) => ({
        ...bidFields(b),
        coverUrl: covers.get(b.case.id) ?? null,
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
        !since && rows.length > limit && last
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
    search: MineFilterFields = {},
    updatedSince?: string,
  ): Promise<Page<WorkItemDto>> {
    if (user.role !== 'attorney') throw forbidden('Attorneys only.');
    // Owner 2026-10-22 (client economy plan, package E): the delta — my
    // accepted bids whose row or case changed since; rows outside this tab
    // (the case closed / reopened) come back as deletedIds.
    const since = parseUpdatedSince(updatedSince);
    const c = cursor && !since ? decodeCursor(cursor) : undefined;
    // From the attorney's accepted bids — index bids(attorney_id, status,
    // updated_at) — rather than scanning cases (load review, file 04).
    const [bids, active] = await Promise.all([
      this.prisma.bid.findMany({
        where: {
          attorney_id: user.sub,
          status: 'accepted',
          accepted_for_case: since
            ? { isNot: null }
            : {
                status: { in: WORK_STATUSES[filter] },
                // Owner 2026-10-18: also by the client's name / @username
                // (when the attorney sees names) and accent-insensitively.
                ...(await mineWhere(this.prisma, search, {
                  attorneyId: user.sub,
                  withClient: search.q
                    ? await this.subscriptions.isActive(user.sub)
                    : false,
                })),
              },
          ...(since
            ? {
                OR: [
                  { updated_at: { gte: since } },
                  { accepted_for_case: { updated_at: { gte: since } } },
                ],
              }
            : {}),
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
        take: since ? 500 : limit + 1,
        select: {
          id: true,
          fee_type: true,
          amount_cents: true,
          percent_bps: true,
          decided_at: true,
          updated_at: true,
          accepted_for_case: {
            select: {
              id: true,
              title: true,
              status: true,
              updated_at: true,
              auto_close_at: true,
              closed_at: true,
              primary_state_code: true,
              states: { select: { is_primary: true } },
              practice_area: {
                select: { name_en: true, i18n_key: true, code: true },
              },
              client: {
                select: {
                  first_name: true,
                  last_name: true,
                  avatar_file_id: true,
                },
              },
            },
          },
        },
      }),
      this.subscriptions.isActive(user.sub),
    ]);
    const inTab = (b: (typeof bids)[number]) =>
      !!b.accepted_for_case &&
      (WORK_STATUSES[filter] as readonly string[]).includes(
        b.accepted_for_case.status,
      );
    const page = since ? bids.filter(inTab) : bids.slice(0, limit);
    const last = page[page.length - 1];
    const covers = await this.photos.coverUrls(
      page.flatMap((b) =>
        b.accepted_for_case ? [b.accepted_for_case.id] : [],
      ),
      user.sub,
    );
    // Owner 2026-10-15: the client's small avatar on the card — shown
    // under the same rule as the name (locked without a subscription).
    const avatars = active
      ? await this.files.avatarUrlsMany(
          page.map((b) => b.accepted_for_case?.client.avatar_file_id ?? null),
        )
      : new Map<string, { url256: string | null }>();
    return {
      ...(since
        ? {
            deletedIds: bids.filter((b) => !inTab(b)).map((b) => b.id),
            syncedAt: syncedAt(
              bids.flatMap((b) => [
                b.updated_at,
                b.accepted_for_case?.updated_at,
              ]),
              since,
            ),
          }
        : {}),
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
            additionalStateCount: k.states.filter((x) => !x.is_primary).length,
            practiceAreaNameEn: k.practice_area.name_en,
            practiceAreaI18nKey: k.practice_area.i18n_key,
            practiceAreaCode: k.practice_area.code,
            clientName: active
              ? [k.client.first_name, k.client.last_name]
                  .filter(Boolean)
                  .join(' ') || null
              : null,
            clientAvatarUrl: k.client.avatar_file_id
              ? (avatars.get(k.client.avatar_file_id)?.url256 ?? null)
              : null,
            feeType: b.fee_type,
            amountCents: b.amount_cents,
            percentBps: b.percent_bps,
            autoCloseAt: k.auto_close_at?.toISOString() ?? null,
            acceptedAt: b.decided_at?.toISOString() ?? null,
            closedAt: k.closed_at?.toISOString() ?? null,
            coverUrl: covers.get(k.id) ?? null,
          },
        ];
      }),
      nextCursor:
        !since && bids.length > limit && last
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
    search: MineFilterFields = {},
  ): Promise<Page<SavedCaseItemDto>> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    // Owner 2026-09-30: search and filters — the saved ids that match.
    const matching = hasMineFilter(search)
      ? (
          await this.prisma.case.findMany({
            where: {
              id: {
                in: (
                  await this.prisma.savedItem.findMany({
                    where: { user_id: user.sub, item_type: 'case' },
                    select: { item_id: true },
                    take: 2000,
                  })
                ).map((s) => s.item_id),
              },
              ...(await mineWhere(this.prisma, search)),
            },
            select: { id: true },
          })
        ).map((k) => k.id)
      : null;
    const rows = await this.prisma.savedItem.findMany({
      where: {
        user_id: user.sub,
        item_type: 'case',
        ...(matching ? { item_id: { in: matching } } : {}),
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
    // Owner 2026-10-02: no chat across a block (either way).
    const owner = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { client_id: true },
    });
    if (owner) {
      await assertNoBlockBetween(this.prisma, user.sub, owner.client_id);
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
    percentBps: b.percent_bps,
    message: b.message,
    startAvailability: b.start_availability,
    startDate: b.start_date ? b.start_date.toISOString().slice(0, 10) : null,
    estimatedDurationDays: b.estimated_duration_days,
    roundCount: b.round_count,
    turn: b.turn,
    outsidePractice: b.outside_practice,
    outsideLicensedStates: b.outside_licensed_states,
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
        percentBps: o.percent_bps,
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
        percentBps: b.percent_bps,
        message: b.message,
        status: 'pending' as const,
        createdAt: b.created_at.toISOString(),
      };
}
