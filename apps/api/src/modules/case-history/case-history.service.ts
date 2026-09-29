import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  AUTH_EVENT_TYPES,
  AuthEventService,
} from '../auth/services/auth-event.service';
import type { RequestMeta } from '../auth/services/session.service';
import {
  HISTORY_PAGE_DEFAULT,
  type CaseHistoryDetailDto,
  type CaseHistoryEventDto,
  type CaseHistoryItemDto,
  type CaseHistoryPage,
} from './dto/case-history.dto';

const CASE_SELECT = {
  id: true,
  title: true,
  primary_state_code: true,
  status: true,
  created_at: true,
  closed_at: true,
  archived_at: true,
  deleted_at: true,
  client_id: true,
  practice_area: {
    select: { id: true, code: true, i18n_key: true, name_en: true },
  },
  accepted_bid: {
    select: { amount_cents: true, fee_type: true, attorney_id: true },
  },
} satisfies Prisma.CaseSelect;

type HistoryCase = Prisma.CaseGetPayload<{ select: typeof CASE_SELECT }>;

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * docs/04_CASES_BIDS.md §12 (stage 4.7) — "История кейсов": read-only list
 * and timeline for clients (their cases) and attorneys (cases they bid
 * on), including closed, archived and deleted-from-feed cases. Every
 * entry is recorded as `history_viewed` in auth_events. No write path
 * exists here: the journal is append-only (docs/02 §4.D).
 */
@Injectable()
export class CaseHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authEvents: AuthEventService,
  ) {}

  /** Cases a user may see in their history (deny by default). */
  visibleWhere(user: RequestUser): Prisma.CaseWhereInput {
    if (user.role === 'client') return { client_id: user.sub };
    if (user.role === 'attorney') {
      return { bids: { some: { attorney_id: user.sub } } };
    }
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Case history is available to clients and attorneys.',
    });
  }

  async list(
    user: RequestUser,
    query: { cursor?: string; limit?: number },
    meta: RequestMeta,
  ): Promise<CaseHistoryPage> {
    const where = this.visibleWhere(user);
    const limit = query.limit ?? HISTORY_PAGE_DEFAULT;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await this.prisma.case.findMany({
      where: withDeleted({
        ...where,
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      }),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: CASE_SELECT,
    });
    // The first page is "entering" the section (§12); later pages are not.
    if (!cursor) await this.recordView(user, meta, null);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((c) => this.toItem(user, c)),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async detail(
    user: RequestUser,
    caseId: string,
    meta: RequestMeta,
  ): Promise<CaseHistoryDetailDto> {
    const kase = await this.prisma.case.findFirst({
      where: withDeleted({ id: caseId, ...this.visibleWhere(user) }),
      select: CASE_SELECT,
    });
    if (!kase) {
      throw new NotFoundException({
        code: ErrorCode.CASE_NOT_FOUND,
        message: 'Case not found.',
      });
    }
    await this.recordView(user, meta, caseId);
    const [events, clientName] = await Promise.all([
      this.events(user, caseId),
      this.clientNameFor(user, kase),
    ]);
    return { ...this.toItem(user, kase), clientName, events };
  }

  /** Every case + timeline for the PDF export (bounded by the caller). */
  async collectForExport(
    user: RequestUser,
    maxCases: number,
  ): Promise<{ cases: CaseHistoryDetailDto[]; truncated: boolean }> {
    const rows = await this.prisma.case.findMany({
      where: withDeleted(this.visibleWhere(user)),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: maxCases + 1,
      select: CASE_SELECT,
    });
    const cases: CaseHistoryDetailDto[] = [];
    for (const kase of rows.slice(0, maxCases)) {
      cases.push({
        ...this.toItem(user, kase),
        clientName: await this.clientNameFor(user, kase),
        events: await this.events(user, kase.id),
      });
    }
    return { cases, truncated: rows.length > maxCases };
  }

  private toItem(user: RequestUser, c: HistoryCase): CaseHistoryItemDto {
    const bid = c.accepted_bid;
    const showBid =
      bid && (user.role === 'client' || bid.attorney_id === user.sub);
    return {
      id: c.id,
      title: c.title,
      practiceArea: {
        id: c.practice_area.id,
        code: c.practice_area.code,
        i18nKey: c.practice_area.i18n_key,
        nameEn: c.practice_area.name_en,
      },
      primaryStateCode: c.primary_state_code,
      status: c.status,
      deleted: c.deleted_at !== null,
      createdAt: c.created_at.toISOString(),
      closedAt: c.closed_at?.toISOString() ?? null,
      archivedAt: c.archived_at?.toISOString() ?? null,
      acceptedBid: showBid
        ? { amountCents: bid.amount_cents, feeType: bid.fee_type }
        : null,
    };
  }

  /** Timeline (§12). An attorney sees case-level events and their own
   * bid events, never another attorney's bids. Payload is reduced to
   * display fields (no IPs/devices from contacts_disclosed). */
  private async events(
    user: RequestUser,
    caseId: string,
  ): Promise<CaseHistoryEventDto[]> {
    const rows = await this.prisma.caseJournal.findMany({
      where: {
        case_id: caseId,
        ...(user.role === 'attorney'
          ? { OR: [{ attorney_id: null }, { attorney_id: user.sub }] }
          : {}),
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        event_type: true,
        created_at: true,
        actor_role: true,
        payload: true,
      },
    });
    return rows.map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      const role = r.actor_role;
      return {
        id: r.id,
        eventType: r.event_type,
        createdAt: r.created_at.toISOString(),
        actorRole:
          role === 'client' || role === 'attorney' || role === 'admin'
            ? role
            : 'system',
        amountCents: num(p.amountCents),
        feeType: str(p.feeType),
        roundNo: num(p.roundNo),
        reason: str(p.reason),
      };
    });
  }

  /** §12: the attorney sees the client's name only if contacts were
   * disclosed to them on this case; otherwise null ("Client"). */
  private async clientNameFor(
    user: RequestUser,
    kase: HistoryCase,
  ): Promise<string | null> {
    if (user.role === 'attorney') {
      const disclosed = await this.prisma.contactDisclosure.findFirst({
        where: { case_id: kase.id, attorney_id: user.sub },
        select: { id: true },
      });
      if (!disclosed) return null;
    }
    const client = await this.prisma.user.findFirst({
      where: withDeleted({ id: kase.client_id }),
      select: { first_name: true, last_name: true },
    });
    const name = [client?.first_name, client?.last_name]
      .filter(Boolean)
      .join(' ');
    return name || null;
  }

  private async recordView(
    user: RequestUser,
    meta: RequestMeta,
    caseId: string | null,
  ): Promise<void> {
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.HISTORY_VIEWED,
      success: true,
      ip: meta.ip,
      deviceId: meta.deviceId,
      userAgent: meta.userAgent,
      meta: caseId ? { caseId } : {},
    });
  }
}
