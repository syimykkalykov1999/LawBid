import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Case, Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ChatSystemMessages,
  type ChatChange,
} from '../../chat/chat-system.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import type { AdminActor } from '../../admin-auth/admin-auth.decorators';
import { AuditLogService } from '../../admin-access/audit-log.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { BidStateMachine } from '../../bids/domain/bid-state-machine';
import { CaseJournalService } from '../../journal/case-journal.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ReviewsService } from '../../reviews/reviews.service';
import {
  CaseStateMachine,
  caseNotFound,
  type CaseAction,
} from '../domain/case-state-machine';

/** Actor of a system transition (jobs): no user, no role. */
const SYSTEM = { userId: null, role: null } as const;

/** docs/04 §10.2: bids rejected by the auto-archive. */
export const REJECT_REASON_CASE_ARCHIVED = 'case_archived';

export const DISPUTE_AUDIT = { resolve: 'case_dispute.resolve' } as const;

export type DisputeDecision = 'closed' | 'in_progress';

type Actor = {
  userId: string | null;
  role: 'client' | 'attorney' | 'admin' | null;
};

/**
 * docs/04_CASES_BIDS.md §10 (stage 4.6): the case lifecycle after a bid is
 * accepted — "Выполнено", confirm / dispute, the admin dispute decision
 * (API stub with a role; the admin screen is docs/06) — plus the system
 * transitions the §10.2 jobs run (stale prompt, auto-archive, auto-close).
 *
 * Every status change goes through CaseStateMachine; bids through
 * BidStateMachine; case_journal via CaseJournalService.append() in the same
 * transaction; notifications rows commit with it (delivery is docs/05).
 * Non-participants get CASE_NOT_FOUND (deny by default, no existence leak).
 */
@Injectable()
export class CaseLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseMachine: CaseStateMachine,
    private readonly bidMachine: BidStateMachine,
    private readonly journal: CaseJournalService,
    private readonly notifications: NotificationsService,
    private readonly reviews: ReviewsService,
    private readonly audit: AuditLogService,
    private readonly chat: ChatSystemMessages,
  ) {}

  /** POST /cases/:id/complete — client "Выполнено" (§10.1):
   * in_progress → pending_completion, auto_close_at = now + 7 days, the
   * accepted attorney gets `completion_requested`. */
  async complete(user: RequestUser, caseId: string): Promise<Case> {
    if (user.role !== 'client') throw caseNotFound();
    return withTxRetry(this.prisma, async (tx) => {
      const { clientId, attorneyId } = await this.parties(tx, caseId);
      if (clientId !== user.sub) throw caseNotFound();
      const { case: after, plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: 'client_complete',
      });
      const autoCloseAt = after.auto_close_at?.toISOString() ?? null;
      await this.journal.append(tx, {
        caseId,
        clientId,
        attorneyId,
        actor: { userId: user.sub, role: 'client' },
        event: plan.event,
        payload: { autoCloseAt },
      });
      await this.notifications.emit(
        {
          type: 'completion_requested',
          recipientId: attorneyId,
          payload: { caseId, autoCloseAt },
        },
        tx,
      );
      return after;
    });
  }

  /** POST /cases/:id/confirm-completion — attorney "Подтвердить" (§10.1). */
  async confirmCompletion(user: RequestUser, caseId: string): Promise<Case> {
    if (user.role !== 'attorney') throw caseNotFound();
    const chat: ChatChange[] = [];
    const after = await withTxRetry(this.prisma, async (tx) => {
      chat.length = 0;
      const { clientId, attorneyId } = await this.parties(tx, caseId);
      if (attorneyId !== user.sub) throw caseNotFound();
      return this.closeInTx(tx, {
        caseId,
        clientId,
        attorneyId,
        action: 'attorney_confirm',
        actor: { userId: user.sub, role: 'attorney' },
        payload: {},
        chat,
      });
    });
    this.chat.publish(chat);
    return after;
  }

  /** POST /cases/:id/dispute — attorney "Оспорить" with a mandatory reason
   * (§10.1): pending_completion → disputed + a case_disputes row. */
  async dispute(
    user: RequestUser,
    caseId: string,
    reason: string,
  ): Promise<Case> {
    if (user.role !== 'attorney') throw caseNotFound();
    return withTxRetry(this.prisma, async (tx) => {
      const { clientId, attorneyId } = await this.parties(tx, caseId);
      if (attorneyId !== user.sub) throw caseNotFound();
      const { case: after, plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: 'attorney_dispute',
      });
      const dispute = await tx.caseDispute.create({
        data: { case_id: caseId, opened_by: user.sub, reason },
        select: { id: true },
      });
      await this.journal.append(tx, {
        caseId,
        clientId,
        attorneyId,
        actor: { userId: user.sub, role: 'attorney' },
        event: plan.event,
        payload: { disputeId: dispute.id, reason },
      });
      return after;
    });
  }

  /** POST /admin/case-disputes/:id/resolve — docs/04 §10.1 "решение по
   * спору" (API stub with a role; the admin screen is docs/06): disputed →
   * closed (closed_at set) or back to in_progress. audit_log row. */
  async resolveDispute(
    admin: AdminActor,
    disputeId: string,
    decision: DisputeDecision,
    note: string,
  ): Promise<Case> {
    const chat: ChatChange[] = [];
    const resolved = await withTxRetry(this.prisma, async (tx) => {
      chat.length = 0;
      const dispute = await tx.caseDispute.findUnique({
        where: { id: disputeId },
        select: { case_id: true, status: true },
      });
      if (!dispute) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Dispute not found.',
        });
      }
      if (dispute.status !== 'open') {
        throw new ConflictException({
          code: ErrorCode.CASE_INVALID_STATE,
          message: 'This dispute is already resolved.',
        });
      }
      const caseId = dispute.case_id;
      const { clientId, attorneyId } = await this.parties(tx, caseId);
      const actor: Actor = { userId: admin.id, role: 'admin' };
      const payload = { disputeId, decision, note };
      let after: Case;
      if (decision === 'closed') {
        after = await this.closeInTx(tx, {
          caseId,
          clientId,
          attorneyId,
          action: 'admin_resolve_close',
          actor,
          payload,
          chat,
        });
      } else {
        const res = await this.caseMachine.apply(tx, {
          caseId,
          action: 'admin_resolve_reopen',
        });
        await this.journal.append(tx, {
          caseId,
          clientId,
          attorneyId,
          actor,
          event: res.plan.event,
          payload,
        });
        // docs/06 §2.3 item 5: both sides learn about the decision (the
        // `closed` branch does it through closeInTx → case_closed).
        for (const recipientId of [clientId, attorneyId]) {
          if (!recipientId) continue;
          await this.notifications.emit(
            {
              type: 'case_updated',
              recipientId,
              payload: { caseId, disputeId, decision },
            },
            tx,
          );
        }
        after = res.case;
      }
      await tx.caseDispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolved_by: admin.id,
          resolved_at: new Date(),
          resolution_note: note,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: DISPUTE_AUDIT.resolve,
          targetType: 'case_dispute',
          targetId: disputeId,
          before: { status: 'open', caseStatus: 'disputed' },
          after: { status: 'resolved', decision, note },
          ip: admin.ip,
        },
        tx,
      );
      return after;
    });
    this.chat.publish(chat);
    return resolved;
  }

  /** §10.2 "Напоминание об актуальности" for one case. Returns false when
   * the case is no longer due (raced with the client or another run). */
  async sendStalePrompt(
    caseId: string,
    now: Date,
    inactiveBefore: Date,
  ): Promise<boolean> {
    return withTxRetry(this.prisma, async (tx) => {
      const row = await this.lockCase(tx, caseId);
      if (
        !row ||
        row.status !== 'open' ||
        row.stale_prompt_sent_at ||
        row.last_activity_at >= inactiveBefore
      ) {
        return false;
      }
      const { plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: 'system_stale_prompt',
        now,
      });
      await this.journal.append(tx, {
        caseId,
        clientId: row.client_id,
        actor: SYSTEM,
        event: plan.event,
        payload: { stalePrompt: true },
      });
      await this.notifications.emit(
        {
          type: 'case_stale_prompt',
          recipientId: row.client_id,
          payload: { caseId },
        },
        tx,
      );
      return true;
    });
  }

  /** §10.2 auto-archive for one case: archived, active bids rejected_auto
   * (reason case_archived), pre-acceptance chats closed (§9), client gets
   * `case_archived`. Re-checks the due condition under the row lock. */
  async autoArchive(
    caseId: string,
    now: Date,
    promptedBefore: Date,
  ): Promise<boolean> {
    const chat: ChatChange[] = [];
    const done = await withTxRetry(this.prisma, async (tx) => {
      chat.length = 0;
      const row = await this.lockCase(tx, caseId);
      if (
        !row ||
        row.status !== 'open' ||
        !row.stale_prompt_sent_at ||
        row.stale_prompt_sent_at >= promptedBefore ||
        row.last_activity_at > row.stale_prompt_sent_at
      ) {
        return false;
      }
      await this.archiveInTx(tx, caseId, row.client_id, now, chat);
      return true;
    });
    this.chat.publish(chat);
    return done;
  }

  /**
   * docs/06 §3.4: a suspended client's `open` cases go to `archived` with
   * active bids `rejected_auto`; `in_progress` cases stay. Same effects
   * as the §10.2 auto-archive (journal, attorney notifications, chats
   * closed), one transaction per case. Returns the archived case ids.
   */
  async archiveOpenCasesOfClient(
    clientId: string,
    now: Date = new Date(),
  ): Promise<string[]> {
    const open = await this.prisma.case.findMany({
      where: { client_id: clientId, status: 'open' },
      select: { id: true },
    });
    const archived: string[] = [];
    for (const { id } of open) {
      const chat: ChatChange[] = [];
      const done = await withTxRetry(this.prisma, async (tx) => {
        chat.length = 0;
        const row = await this.lockCase(tx, id);
        if (!row || row.status !== 'open') return false;
        await this.archiveInTx(tx, id, row.client_id, now, chat);
        return true;
      });
      this.chat.publish(chat);
      if (done) archived.push(id);
    }
    return archived;
  }

  /** Archive one locked `open` case: status, bids, journal, chats,
   * notifications (shared by auto-archive and client suspension). */
  private async archiveInTx(
    tx: Prisma.TransactionClient,
    caseId: string,
    clientId: string,
    now: Date,
    chat: ChatChange[],
  ): Promise<void> {
    {
      const { plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: 'auto_archive',
        now,
      });
      await this.journal.append(tx, {
        caseId,
        clientId,
        actor: SYSTEM,
        event: plan.event,
        payload: {},
      });
      const rejected = await this.bidMachine.applyToActive(
        tx,
        { caseId },
        'auto_reject',
        now,
      );
      for (const r of rejected) {
        await this.journal.append(tx, {
          caseId,
          clientId,
          actor: SYSTEM,
          attorneyId: r.attorney_id,
          event: r.plan.event,
          payload: { bidId: r.id, reason: REJECT_REASON_CASE_ARCHIVED },
        });
        await this.notifications.emit(
          {
            type: 'bid_rejected',
            recipientId: r.attorney_id,
            payload: {
              caseId,
              bidId: r.id,
              reason: REJECT_REASON_CASE_ARCHIVED,
            },
          },
          tx,
        );
      }
      chat.push(
        ...(await this.chat.post(
          tx,
          { case_id: caseId, status: 'pre_acceptance' },
          'case_closed',
          { close: true },
        )),
      );
      await this.notifications.emit(
        { type: 'case_archived', recipientId: clientId, payload: { caseId } },
        tx,
      );
    }
  }

  /** §10.2 auto-close for one case (auto_close_at reached, attorney did
   * not answer): closed, event auto_closed. */
  async autoClose(caseId: string, now: Date): Promise<boolean> {
    const chat: ChatChange[] = [];
    const done = await withTxRetry(this.prisma, async (tx) => {
      chat.length = 0;
      const row = await this.lockCase(tx, caseId);
      if (
        !row ||
        row.status !== 'pending_completion' ||
        !row.auto_close_at ||
        row.auto_close_at > now
      ) {
        return false;
      }
      const { clientId, attorneyId } = await this.parties(tx, caseId);
      await this.closeInTx(tx, {
        caseId,
        clientId,
        attorneyId,
        action: 'auto_close',
        actor: SYSTEM,
        payload: {},
        now,
        chat,
      });
      return true;
    });
    this.chat.publish(chat);
    return done;
  }

  /** Shared close effects (§10.1): the transition + journal, `case_closed`
   * to both sides (§13) and the review request to the client (docs/03
   * §7.3; §10.1 "После closed … предложением оставить отзыв"). */
  private async closeInTx(
    tx: Prisma.TransactionClient,
    input: {
      caseId: string;
      clientId: string;
      attorneyId: string;
      action: Extract<
        CaseAction,
        'attorney_confirm' | 'auto_close' | 'admin_resolve_close'
      >;
      actor: Actor;
      payload: Prisma.InputJsonObject;
      now?: Date;
      /** Collects chat changes to publish after commit. */
      chat: ChatChange[];
    },
  ): Promise<Case> {
    const { caseId, clientId, attorneyId } = input;
    const { case: after, plan } = await this.caseMachine.apply(tx, {
      caseId,
      action: input.action,
      now: input.now,
    });
    await this.journal.append(tx, {
      caseId,
      clientId,
      attorneyId,
      actor: input.actor,
      event: plan.event,
      payload: input.payload,
    });
    for (const recipientId of [clientId, attorneyId]) {
      await this.notifications.emit(
        { type: 'case_closed', recipientId, payload: { caseId } },
        tx,
      );
    }
    await this.reviews.requestReview({ caseId, clientId, attorneyId }, tx);
    // docs/05 §8.2 "Кейс закрыт" in the case's open conversations.
    input.chat.push(
      ...(await this.chat.post(
        tx,
        { case_id: caseId, status: { not: 'closed' } },
        'case_closed',
      )),
    );
    return after;
  }

  /** The case's client and the attorney of its accepted bid. A case
   * without an accepted bid has no lifecycle past `open` (404 here). */
  private async parties(
    tx: Prisma.TransactionClient,
    caseId: string,
  ): Promise<{ clientId: string; attorneyId: string }> {
    const kase = await tx.case.findUnique({
      where: { id: caseId },
      select: {
        client_id: true,
        accepted_bid: { select: { attorney_id: true } },
      },
    });
    if (!kase?.accepted_bid) throw caseNotFound();
    return {
      clientId: kase.client_id,
      attorneyId: kase.accepted_bid.attorney_id,
    };
  }

  private async lockCase(tx: Prisma.TransactionClient, caseId: string) {
    const rows = await tx.$queryRaw<
      {
        client_id: string;
        status: Case['status'];
        stale_prompt_sent_at: Date | null;
        last_activity_at: Date;
        auto_close_at: Date | null;
      }[]
    >`SELECT client_id::STRING AS client_id, status, stale_prompt_sent_at,
             last_activity_at, auto_close_at
      FROM cases WHERE id = ${caseId}::UUID AND deleted_at IS NULL
      FOR UPDATE`;
    return rows[0] ?? null;
  }
}
