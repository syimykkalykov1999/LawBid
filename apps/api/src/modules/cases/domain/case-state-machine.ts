import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Case,
  CaseJournalEvent,
  CaseStatus,
  Prisma,
} from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { withDeleted } from '../../../prisma/soft-delete.extension';

/**
 * docs/04_CASES_BIDS.md §10.1 — the case lifecycle. Every change of a
 * case's status (and the in-place actions §3.5/§10.2 allow only in given
 * statuses) goes through this machine (.cursorrules: "Изменения кейсов
 * только через CaseStateMachine"). Anything not in the table is
 * CASE_INVALID_STATE (409).
 *
 * The table is pure data; `planCaseTransition` is a pure function over it
 * (unit-tested exhaustively); `CaseStateMachine.apply` performs the guarded
 * write inside the caller's transaction. The machine does not write the
 * journal: the caller appends `plan.event` via CaseJournalService.append()
 * in the same transaction (the payload differs per use case).
 */
export type CaseAction =
  // §7: the accepted bid moves the case to work.
  | 'accept_bid'
  // §3.5 "Закрыть кейс" without choosing a bid.
  | 'client_close'
  // §10.2 auto-archive job.
  | 'auto_archive'
  // §10.1 "Вернуть" from the archive.
  | 'client_restore'
  // §10.1 client "Выполнено".
  | 'client_complete'
  // §10.1 attorney "Подтвердить".
  | 'attorney_confirm'
  // §10.2 auto-close job: auto_close_at reached.
  | 'auto_close'
  // §10.1 attorney "Оспорить".
  | 'attorney_dispute'
  // §10.1 admin resolves a dispute (file 06).
  | 'admin_resolve_close'
  | 'admin_resolve_reopen'
  // docs/06 §5.1: account anonymization closes the cases still in work.
  | 'account_deleted_close'
  // Audit 2026-10-02 (admin panel → Cases): support closes, archives
  // (also the moderation "hide" — a case has no content status) and
  // restores an open case. Same edges as the client/system actions.
  | 'admin_close'
  | 'admin_archive'
  | 'admin_restore'
  // In-place actions (status unchanged): §3.5 edit and delete, §10.2
  // "Да, актуален".
  | 'client_edit'
  | 'client_keep_alive'
  | 'client_delete'
  // §10.2 "Напоминание об актуальности" job: stale_prompt_sent_at = now().
  | 'system_stale_prompt';

export interface CaseTransitionRule {
  readonly from: readonly CaseStatus[];
  /** null: the status does not change (in-place action). */
  readonly to: CaseStatus | null;
  /** The case_journal event the caller appends for this action. */
  readonly event: CaseJournalEvent;
}

export const CASE_TRANSITIONS: Readonly<
  Record<CaseAction, CaseTransitionRule>
> = {
  accept_bid: { from: ['open'], to: 'in_progress', event: 'bid_accepted' },
  client_close: { from: ['open'], to: 'closed', event: 'closed' },
  auto_archive: { from: ['open'], to: 'archived', event: 'archived' },
  client_restore: { from: ['archived'], to: 'open', event: 'restored' },
  client_complete: {
    from: ['in_progress'],
    to: 'pending_completion',
    event: 'completion_requested',
  },
  attorney_confirm: {
    from: ['pending_completion'],
    to: 'closed',
    event: 'completion_confirmed',
  },
  auto_close: {
    from: ['pending_completion'],
    to: 'closed',
    event: 'auto_closed',
  },
  attorney_dispute: {
    from: ['pending_completion'],
    to: 'disputed',
    event: 'disputed',
  },
  admin_resolve_close: {
    from: ['disputed'],
    to: 'closed',
    event: 'dispute_resolved',
  },
  admin_resolve_reopen: {
    from: ['disputed'],
    to: 'in_progress',
    event: 'dispute_resolved',
  },
  account_deleted_close: {
    from: ['in_progress', 'pending_completion', 'disputed'],
    to: 'closed',
    event: 'closed',
  },
  admin_close: { from: ['open'], to: 'closed', event: 'closed' },
  admin_archive: { from: ['open'], to: 'archived', event: 'archived' },
  admin_restore: { from: ['archived'], to: 'open', event: 'restored' },
  client_edit: { from: ['open'], to: null, event: 'updated' },
  client_keep_alive: { from: ['open'], to: null, event: 'updated' },
  // §3.5 / §10.1: deletion only from open and archived.
  client_delete: { from: ['open', 'archived'], to: null, event: 'deleted' },
  system_stale_prompt: { from: ['open'], to: null, event: 'updated' },
};

export const CASE_ACTIONS = Object.keys(CASE_TRANSITIONS) as CaseAction[];

/** §10.1: completion is auto-confirmed 7 days after the client's
 * "Выполнено". */
export const AUTO_CLOSE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface CaseTransitionContext {
  now: Date;
  /** Required for accept_bid. */
  acceptedBidId?: string;
}

export interface CaseTransitionPlan {
  action: CaseAction;
  from: CaseStatus;
  to: CaseStatus;
  event: CaseJournalEvent;
  /** Column updates the transition implies (§10.1 "Условие"). */
  data: Prisma.CaseUncheckedUpdateManyInput;
}

export function caseInvalidState(
  action: CaseAction,
  status: CaseStatus,
): ConflictException {
  return new ConflictException({
    code: ErrorCode.CASE_INVALID_STATE,
    message: 'This action is not available for the case in its current state.',
    details: { action, status },
  });
}

export function canApplyCaseAction(
  status: CaseStatus,
  action: CaseAction,
): boolean {
  return CASE_TRANSITIONS[action].from.includes(status);
}

/**
 * Pure: validates `action` from `status` and returns the target status,
 * the journal event and the column changes. Throws CASE_INVALID_STATE.
 */
export function planCaseTransition(
  status: CaseStatus,
  action: CaseAction,
  ctx: CaseTransitionContext,
): CaseTransitionPlan {
  const rule = CASE_TRANSITIONS[action];
  if (!rule.from.includes(status)) throw caseInvalidState(action, status);
  const { now } = ctx;
  let data: Prisma.CaseUncheckedUpdateManyInput;
  switch (action) {
    case 'accept_bid':
      if (!ctx.acceptedBidId) {
        throw new Error('accept_bid needs acceptedBidId');
      }
      data = { accepted_bid_id: ctx.acceptedBidId, last_activity_at: now };
      break;
    case 'client_close':
    case 'admin_close':
      data = { closed_at: now, last_activity_at: now };
      break;
    case 'auto_archive':
    case 'admin_archive':
      data = { archived_at: now };
      break;
    case 'client_restore':
    case 'admin_restore':
      // §10.1: last_activity_at = now(), archived_at = null. The stale
      // prompt is reset too (as for "Да, актуален", §10.2), otherwise the
      // §10.2 reminder (stale_prompt_sent_at IS NULL) never fires again.
      data = {
        archived_at: null,
        last_activity_at: now,
        stale_prompt_sent_at: null,
      };
      break;
    case 'client_complete':
      data = {
        client_completed_at: now,
        auto_close_at: new Date(now.getTime() + AUTO_CLOSE_AFTER_MS),
        last_activity_at: now,
      };
      break;
    case 'attorney_confirm':
      data = { attorney_confirmed_at: now, closed_at: now };
      break;
    case 'auto_close':
    case 'admin_resolve_close':
    case 'account_deleted_close':
      data = { closed_at: now };
      break;
    case 'attorney_dispute':
      data = {};
      break;
    case 'admin_resolve_reopen':
      // Back to work: the completion request is void.
      data = { client_completed_at: null, auto_close_at: null };
      break;
    case 'client_edit':
      data = { last_activity_at: now };
      break;
    case 'client_keep_alive':
      data = { last_activity_at: now, stale_prompt_sent_at: null };
      break;
    case 'system_stale_prompt':
      // Not client activity: last_activity_at stays as it is.
      data = { stale_prompt_sent_at: now };
      break;
    case 'client_delete':
      data = { deleted_at: now };
      break;
  }
  const to = rule.to ?? status;
  if (rule.to) data.status = rule.to;
  return { action, from: status, to, event: rule.event, data };
}

export interface ApplyCaseActionInput extends Partial<CaseTransitionContext> {
  caseId: string;
  action: CaseAction;
  /** Extra columns written with the transition (e.g. edited fields for
   * client_edit). Must not touch `status`. */
  extra?: Omit<Prisma.CaseUncheckedUpdateManyInput, 'status'>;
}

@Injectable()
export class CaseStateMachine {
  /**
   * Guarded write inside the caller's transaction: reads the live case,
   * plans the action, then updates with a compare-and-set on the status
   * it planned from, so a concurrent transition turns into
   * CASE_INVALID_STATE instead of a lost update. Soft-deleted cases are
   * CASE_NOT_FOUND.
   */
  async apply(
    tx: Prisma.TransactionClient,
    input: ApplyCaseActionInput,
  ): Promise<{ case: Case; plan: CaseTransitionPlan }> {
    const current = await tx.case.findUnique({
      where: { id: input.caseId },
      select: { status: true },
    });
    if (!current) throw caseNotFound();
    const plan = planCaseTransition(current.status, input.action, {
      now: input.now ?? new Date(),
      acceptedBidId: input.acceptedBidId,
    });
    const { count } = await tx.case.updateMany({
      where: { id: input.caseId, status: current.status, deleted_at: null },
      data: { ...input.extra, ...plan.data },
    });
    if (count !== 1) throw caseInvalidState(input.action, current.status);
    // withDeleted: client_delete has just soft-deleted the row.
    const updated = await tx.case.findFirstOrThrow({
      where: withDeleted({ id: input.caseId }),
    });
    return { case: updated, plan };
  }
}

export function caseNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CASE_NOT_FOUND,
    message: 'Case not found.',
  });
}
