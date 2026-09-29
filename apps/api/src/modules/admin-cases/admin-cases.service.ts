import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdminCaseSummaryDto,
  AdminContactIssueCardDto,
  AdminContactIssueDto,
  AdminDisputeCardDto,
  AdminDisputeDto,
  AdminPartyDto,
  ContactIssuesQueueQueryDto,
  DisputesQueueQueryDto,
  Page,
} from './admin-cases.dto';

const DEFAULT_LIMIT = 20;
const JOURNAL_MAX = 200;

const PARTY = {
  id: true,
  role: true,
  status: true,
  first_name: true,
  last_name: true,
  attorney_profile: { select: { username: true } },
} as const;
type PartyRow = Prisma.UserGetPayload<{ select: typeof PARTY }>;

const CASE = {
  id: true,
  title: true,
  status: true,
  primary_state_code: true,
  created_at: true,
  client: { select: PARTY },
  accepted_bid: { select: { attorney: { select: PARTY } } },
} as const;
type CaseRow = Prisma.CaseGetPayload<{ select: typeof CASE }>;

const DISPUTE = {
  id: true,
  status: true,
  reason: true,
  opened_by: true,
  resolved_by: true,
  resolved_at: true,
  resolution_note: true,
  created_at: true,
  opener: { select: { role: true } },
  case: { select: CASE },
} as const;
type DisputeRow = Prisma.CaseDisputeGetPayload<{ select: typeof DISPUTE }>;

const ISSUE = {
  id: true,
  status: true,
  issue_type: true,
  note: true,
  created_at: true,
  resolved_at: true,
  resolved_by: true,
  resolution_note: true,
  client_id: true,
  bid_id: true,
  case: { select: CASE },
  attorney: { select: PARTY },
} as const;
type IssueRow = Prisma.ContactIssueReportGetPayload<{ select: typeof ISSUE }>;

/**
 * docs/06 §2.3 item 5: the two case queues for support — disputes
 * (`case_disputes`, chronology from `case_journal`) and "Не могу
 * связаться" (`contact_issue_reports`, with the client's confirmed
 * count against the §8.4 threshold). Decisions stay on the file-04
 * endpoints (`/admin/case-disputes/:id/resolve`,
 * `/admin/contact-issues/:id/resolve`); this service only reads.
 */
@Injectable()
export class AdminCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
  ) {}

  async disputes(q: DisputesQueueQueryDto): Promise<Page<AdminDisputeDto>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const status = q.status ?? 'open';
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.caseDispute.findMany({
      where: {
        status,
        ...(cursor
          ? {
              OR: [
                { created_at: { gt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      select: DISPUTE,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(dispute),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async dispute(id: string): Promise<AdminDisputeCardDto> {
    const row = await this.prisma.caseDispute.findUnique({
      where: { id },
      select: DISPUTE,
    });
    if (!row) throw notFound('Dispute');
    const [journal, openerDisputes] = await Promise.all([
      this.prisma.caseJournal.findMany({
        where: { case_id: row.case.id },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        take: JOURNAL_MAX,
        select: {
          id: true,
          event_type: true,
          actor_role: true,
          actor_user_id: true,
          payload: true,
          created_at: true,
        },
      }),
      this.prisma.caseDispute.count({
        where: { opened_by: row.opened_by, id: { not: id } },
      }),
    ]);
    return {
      ...dispute(row),
      journal: journal.map((j) => ({
        id: j.id,
        eventType: j.event_type,
        actorRole: j.actor_role,
        actorUserId: j.actor_user_id,
        payload: j.payload,
        createdAt: j.created_at.toISOString(),
      })),
      openerDisputes,
    };
  }

  async contactIssues(
    q: ContactIssuesQueueQueryDto,
  ): Promise<Page<AdminContactIssueDto>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const status = q.status ?? 'open';
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const threshold = await this.settings.number(
      'contacts.suspend_after_confirmed_reports',
    );
    const rows = await this.prisma.contactIssueReport.findMany({
      where: {
        status,
        ...(cursor
          ? {
              OR: [
                { created_at: { gt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      select: ISSUE,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const confirmed = await this.confirmedCounts(page.map((r) => r.client_id));
    const last = page[page.length - 1];
    return {
      items: page.map((r) =>
        issue(r, confirmed.get(r.client_id) ?? 0, threshold),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async contactIssue(id: string): Promise<AdminContactIssueCardDto> {
    const row = await this.prisma.contactIssueReport.findUnique({
      where: { id },
      select: ISSUE,
    });
    if (!row) throw notFound('Report');
    const threshold = await this.settings.number(
      'contacts.suspend_after_confirmed_reports',
    );
    const [confirmed, disclosure, history] = await Promise.all([
      this.confirmedCounts([row.client_id]),
      this.prisma.contactDisclosure.findUnique({
        where: { bid_id: row.bid_id },
        select: { fields: true, disclosed_at: true },
      }),
      this.prisma.contactIssueReport.findMany({
        where: { client_id: row.client_id, id: { not: id } },
        select: ISSUE,
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
    ]);
    const n = confirmed.get(row.client_id) ?? 0;
    return {
      ...issue(row, n, threshold),
      disclosedFields: disclosure?.fields ?? [],
      disclosedAt: disclosure?.disclosed_at?.toISOString() ?? null,
      clientHistory: history.map((h) => issue(h, n, threshold)),
    };
  }

  private async confirmedCounts(
    clientIds: string[],
  ): Promise<Map<string, number>> {
    const ids = [...new Set(clientIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.contactIssueReport.groupBy({
      by: ['client_id'],
      where: { client_id: { in: ids }, status: 'confirmed' },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.client_id, r._count._all]));
  }
}

function party(u: PartyRow | null | undefined): AdminPartyDto | null {
  return u
    ? {
        id: u.id,
        role: u.role,
        status: u.status,
        firstName: u.first_name,
        lastName: u.last_name,
        username: u.attorney_profile?.username ?? null,
      }
    : null;
}

function caseSummary(c: CaseRow): AdminCaseSummaryDto {
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    stateCode: c.primary_state_code,
    createdAt: c.created_at.toISOString(),
    client: party(c.client),
    attorney: party(c.accepted_bid?.attorney),
  };
}

function dispute(d: DisputeRow): AdminDisputeDto {
  return {
    id: d.id,
    status: d.status,
    reason: d.reason,
    openedBy: d.opened_by,
    openedByRole: d.opener.role,
    createdAt: d.created_at.toISOString(),
    resolvedAt: d.resolved_at?.toISOString() ?? null,
    resolvedBy: d.resolved_by,
    resolutionNote: d.resolution_note,
    case: caseSummary(d.case),
  };
}

function issue(
  r: IssueRow,
  confirmed: number,
  threshold: number,
): AdminContactIssueDto {
  return {
    id: r.id,
    status: r.status,
    issueType: r.issue_type,
    note: r.note,
    createdAt: r.created_at.toISOString(),
    resolvedAt: r.resolved_at?.toISOString() ?? null,
    resolvedBy: r.resolved_by,
    resolutionNote: r.resolution_note,
    case: caseSummary(r.case),
    attorney: party(r.attorney),
    clientConfirmedReports: confirmed,
    suspendThreshold: threshold,
  };
}

const notFound = (what: string) =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });
