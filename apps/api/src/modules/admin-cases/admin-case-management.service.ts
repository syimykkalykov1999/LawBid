import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { BidStateMachine } from '../bids/domain/bid-state-machine';
import {
  CaseStateMachine,
  caseNotFound,
  type CaseAction,
} from '../cases/domain/case-state-machine';
import {
  ChatSystemMessages,
  type ChatChange,
} from '../chat/chat-system.service';
import { CaseJournalService } from '../journal/case-journal.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminCaseCardDto,
  AdminCaseRowDto,
  AdminCasesQueryDto,
  Page,
} from './admin-cases.dto';

const DEFAULT_LIMIT = 20;
const JOURNAL_MAX = 50;
const BIDS_MAX = 100;
/** Upper bound of reported case ids a `hasReports` filter looks at. */
const REPORTED_MAX = 5000;

export type AdminCaseCommand = 'hide' | 'close' | 'archive' | 'restore';

/** Admin command → CaseStateMachine action. A case has no content status,
 * so the moderation "hide" archives it (out of the feed, bids rejected). */
export const CASE_COMMAND_ACTION: Record<
  AdminCaseCommand,
  Extract<CaseAction, 'admin_close' | 'admin_archive' | 'admin_restore'>
> = {
  hide: 'admin_archive',
  close: 'admin_close',
  archive: 'admin_archive',
  restore: 'admin_restore',
};

export const CASE_AUDIT_ACTION: Record<AdminCaseCommand, string> = {
  hide: 'admin.case.hide',
  close: 'admin.case.close',
  archive: 'admin.case.archive',
  restore: 'admin.case.restore',
};

/** Reason code the attorneys' `bid_rejected` carries. */
const REJECT_REASON: Record<'close' | 'archive', string> = {
  close: 'case_closed',
  archive: 'case_archived',
};

type Named = { first_name: string | null; last_name: string | null } | null;
const nameOf = (u: Named) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(' ') || '—';

const ROW = {
  id: true,
  title: true,
  status: true,
  client_id: true,
  practice_area_id: true,
  primary_state_code: true,
  bids_count: true,
  comment_count: true,
  view_count: true,
  last_activity_at: true,
  created_at: true,
  client: { select: { first_name: true, last_name: true } },
  practice_area: { select: { name_en: true } },
} as const;
type Row = Prisma.CaseGetPayload<{ select: typeof ROW }>;

/**
 * Audit 2026-10-02 — admin panel → Cases: the list, the full card and the
 * support actions (hide / close / archive / restore). Every status change
 * goes through CaseStateMachine, the journal row through
 * CaseJournalService.append() and the audit row in the same transaction
 * (withTxRetry). Closing / archiving rejects the active bids, closes the
 * pre-acceptance chats and notifies like the client's own close.
 */
@Injectable()
export class AdminCaseManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseMachine: CaseStateMachine,
    private readonly bidMachine: BidStateMachine,
    private readonly journal: CaseJournalService,
    private readonly notifications: NotificationsService,
    private readonly chat: ChatSystemMessages,
    private readonly audit: AuditLogService,
  ) {}

  async list(q: AdminCasesQueryDto): Promise<Page<AdminCaseRowDto>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const c = q.cursor ? decodeCursor(q.cursor) : undefined;
    const reported =
      q.hasReports === undefined ? null : await this.reportedCaseIds();
    const and: Prisma.CaseWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.q) and.push({ title: { contains: q.q, mode: 'insensitive' } });
    if (q.clientId) and.push({ client_id: q.clientId });
    if (q.practiceAreaId) and.push({ practice_area_id: q.practiceAreaId });
    if (q.stateCode) {
      and.push({ states: { some: { state_code: q.stateCode } } });
    }
    if (reported) {
      and.push(
        q.hasReports ? { id: { in: reported } } : { id: { notIn: reported } },
      );
    }
    if (c) {
      and.push({
        OR: [
          { created_at: { lt: c.createdAt } },
          { created_at: c.createdAt, id: { lt: c.id } },
        ],
      });
    }
    const rows = await this.prisma.case.findMany({
      where: { AND: and },
      select: ROW,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const ids = page.map((r) => r.id);
    const [reports, promoted] = await Promise.all([
      this.openReportCounts(ids),
      this.activePromotions(ids),
    ]);
    const last = page[page.length - 1];
    return {
      items: page.map((r) =>
        toRow(r, reports.get(r.id) ?? 0, promoted.has(r.id)),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async card(id: string): Promise<AdminCaseCardDto> {
    const kase = await this.prisma.case.findUnique({
      where: { id },
      select: {
        ...ROW,
        description: true,
        city: true,
        budget_mode: true,
        budget_cents: true,
        accepted_bid_id: true,
        archived_at: true,
        closed_at: true,
        client: {
          select: {
            id: true,
            role: true,
            status: true,
            first_name: true,
            last_name: true,
            attorney_profile: { select: { username: true } },
          },
        },
        states: { select: { state_code: true, is_primary: true } },
        _count: { select: { photos: true } },
      },
    });
    if (!kase) throw caseNotFound();
    const [bids, journal, disputes, issues, reports, promoted] =
      await Promise.all([
        this.prisma.bid.findMany({
          where: { case_id: id },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: BIDS_MAX,
          select: {
            id: true,
            attorney_id: true,
            status: true,
            fee_type: true,
            amount_cents: true,
            round_count: true,
            created_at: true,
            attorney: { select: { first_name: true, last_name: true } },
          },
        }),
        this.prisma.caseJournal.findMany({
          where: { case_id: id },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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
        this.prisma.caseDispute.findMany({
          where: { case_id: id },
          orderBy: { created_at: 'desc' },
          select: { id: true },
        }),
        this.prisma.contactIssueReport.findMany({
          where: { case_id: id },
          orderBy: { created_at: 'desc' },
          select: { id: true },
        }),
        this.openReportCounts([id]),
        this.activePromotions([id]),
      ]);
    const until = promoted.get(id) ?? null;
    return {
      ...toRow(kase, reports.get(id) ?? 0, promoted.has(id)),
      description: kase.description,
      city: kase.city,
      budgetMode: kase.budget_mode,
      budgetCents: kase.budget_cents,
      client: {
        id: kase.client.id,
        role: kase.client.role,
        status: kase.client.status,
        firstName: kase.client.first_name,
        lastName: kase.client.last_name,
        username: kase.client.attorney_profile?.username ?? null,
      },
      states: kase.states.map((s) => ({
        code: s.state_code,
        isPrimary: s.is_primary,
      })),
      photosCount: kase._count.photos,
      acceptedBidId: kase.accepted_bid_id,
      bids: bids.map((b) => ({
        id: b.id,
        attorneyId: b.attorney_id,
        attorneyName: nameOf(b.attorney),
        status: b.status,
        feeType: b.fee_type,
        amountCents: b.amount_cents,
        rounds: b.round_count,
        createdAt: b.created_at.toISOString(),
      })),
      journal: journal.map((j) => ({
        id: j.id,
        eventType: j.event_type,
        actorRole: j.actor_role,
        actorUserId: j.actor_user_id,
        payload: j.payload,
        createdAt: j.created_at.toISOString(),
      })),
      disputeIds: disputes.map((d) => d.id),
      contactIssueIds: issues.map((i) => i.id),
      archivedAt: kase.archived_at?.toISOString() ?? null,
      closedAt: kase.closed_at?.toISOString() ?? null,
      promotedUntil: until ? until.toISOString() : null,
    };
  }

  /**
   * hide / archive: open → archived; close: open → closed; restore:
   * archived → open. Anything else is CASE_INVALID_STATE (409) from the
   * machine; a deleted or unknown case is CASE_NOT_FOUND.
   */
  async act(
    admin: AdminActor,
    caseId: string,
    command: AdminCaseCommand,
    reason: string,
  ): Promise<AdminCaseCardDto> {
    const chat: ChatChange[] = [];
    await withTxRetry(this.prisma, async (tx) => {
      chat.length = 0;
      const current = await tx.case.findUnique({
        where: { id: caseId },
        select: { client_id: true, status: true },
      });
      if (!current) throw caseNotFound();
      const actor = { userId: admin.id, role: 'admin' as const };
      const { plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: CASE_COMMAND_ACTION[command],
      });
      await this.journal.append(tx, {
        caseId,
        clientId: current.client_id,
        actor,
        event: plan.event,
        payload: { by: 'admin', command, reason },
      });
      if (command !== 'restore') {
        const why = REJECT_REASON[command === 'close' ? 'close' : 'archive'];
        await this.rejectActiveBids(tx, caseId, current.client_id, actor, why);
        // docs/04 §9: pre-acceptance chats become read-only.
        chat.push(
          ...(await this.chat.post(
            tx,
            { case_id: caseId, status: 'pre_acceptance' },
            'case_closed',
            { close: true },
          )),
        );
      }
      await this.notifications.emit(
        clientNotice(command, caseId, reason, current.client_id),
        tx,
      );
      await this.audit.record(
        {
          adminId: admin.id,
          action: CASE_AUDIT_ACTION[command],
          targetType: 'case',
          targetId: caseId,
          before: { status: plan.from },
          after: { status: plan.to, command, reason },
          ip: admin.ip,
        },
        tx,
      );
    });
    this.chat.publish(chat);
    return this.card(caseId);
  }

  private async rejectActiveBids(
    tx: Prisma.TransactionClient,
    caseId: string,
    clientId: string,
    actor: { userId: string; role: 'admin' },
    reason: string,
  ): Promise<void> {
    const rejected = await this.bidMachine.applyToActive(
      tx,
      { caseId },
      'auto_reject',
    );
    for (const r of rejected) {
      await this.journal.append(tx, {
        caseId,
        clientId,
        actor,
        attorneyId: r.attorney_id,
        event: r.plan.event,
        payload: { bidId: r.id, reason },
      });
      await this.notifications.emit(
        {
          type: 'bid_rejected',
          recipientId: r.attorney_id,
          payload: { caseId, bidId: r.id, reason },
        },
        tx,
      );
    }
  }

  /** Case ids with an open report (bounded). */
  private async reportedCaseIds(): Promise<string[]> {
    const rows = await this.prisma.report.findMany({
      where: { target_type: 'case', status: 'open' },
      select: { target_id: true },
      distinct: ['target_id'],
      take: REPORTED_MAX,
    });
    return rows.map((r) => r.target_id);
  }

  private async openReportCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const groups = await this.prisma.report.groupBy({
      by: ['target_id'],
      where: { target_type: 'case', status: 'open', target_id: { in: ids } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.target_id, g._count._all]));
  }

  /** case id → end of its running promotion. */
  private async activePromotions(ids: string[]): Promise<Map<string, Date>> {
    if (ids.length === 0) return new Map();
    const now = new Date();
    const rows = await this.prisma.casePromotion.findMany({
      where: {
        case_id: { in: ids },
        status: 'active',
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
      select: { case_id: true, ends_at: true },
    });
    const out = new Map<string, Date>();
    for (const r of rows) {
      const end = r.ends_at ?? now;
      const prev = out.get(r.case_id);
      if (!prev || end > prev) out.set(r.case_id, end);
    }
    return out;
  }
}

/** What the client hears: hide → moderation_notice with the reason;
 * close → case_closed; archive → case_archived; restore → case_updated. */
export function clientNotice(
  command: AdminCaseCommand,
  caseId: string,
  reason: string,
  clientId: string,
): {
  type: 'moderation_notice' | 'case_closed' | 'case_archived' | 'case_updated';
  recipientId: string;
  payload: Record<string, string>;
} {
  switch (command) {
    case 'hide':
      return {
        type: 'moderation_notice',
        recipientId: clientId,
        payload: { reason, caseId },
      };
    case 'close':
      return {
        type: 'case_closed',
        recipientId: clientId,
        payload: { caseId },
      };
    case 'archive':
      return {
        type: 'case_archived',
        recipientId: clientId,
        payload: { caseId },
      };
    case 'restore':
      return {
        type: 'case_updated',
        recipientId: clientId,
        payload: { caseId, restored: 'admin' },
      };
  }
}

function toRow(
  r: Row,
  openReports: number,
  promoted: boolean,
): AdminCaseRowDto {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    clientId: r.client_id,
    clientName: nameOf(r.client),
    practiceAreaId: r.practice_area_id,
    practiceAreaName: r.practice_area.name_en,
    stateCode: r.primary_state_code,
    bidsCount: r.bids_count,
    commentCount: r.comment_count,
    viewCount: r.view_count,
    openReports,
    promoted,
    lastActivityAt: r.last_activity_at.toISOString(),
    createdAt: r.created_at.toISOString(),
  };
}
