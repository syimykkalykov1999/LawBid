import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Bid, BidOffer, PartyRole, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CaseAccessPolicy } from '../cases/policies/case-access.policy';
import {
  ChatSystemMessages,
  type ChatChange,
} from '../chat/chat-system.service';
import { CaseJournalService } from '../journal/case-journal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { BidStateMachine, bidNotFound } from './domain/bid-state-machine';
import type { BidDto } from './dto/bid-responses.dto';
import type { CounterOfferDto, CreateBidDto } from './dto/bid-requests.dto';

export type BidWithOffers = Bid & { offers: BidOffer[] };
type BidWithCase = Bid & { case: { client_id: string; status: string } };

/**
 * docs/04_CASES_BIDS.md §5–§6 (stage 4.4): bid creation, withdraw,
 * counter-offers and decline. Every status change of a bid goes through
 * BidStateMachine (.cursorrules); the matching case_journal row is
 * appended in the same transaction via CaseJournalService.append(). Bid
 * acceptance (§7, contacts disclosure) is stage 4.5 and lives elsewhere.
 */
@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bidMachine: BidStateMachine,
    private readonly journal: CaseJournalService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly caseAccess: CaseAccessPolicy,
    private readonly chat: ChatSystemMessages,
  ) {}

  /** POST /cases/:caseId/bids (§5.1). One active-or-ever bid per attorney
   * per case (UQ bids(case_id, attorney_id)): a second attempt — even
   * after the first was withdrawn — is BID_ALREADY_EXISTS. */
  async create(
    user: RequestUser,
    caseId: string,
    dto: CreateBidDto,
  ): Promise<BidDto> {
    if (user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only attorneys can place bids.',
      });
    }
    const amountCents = normalizeAmount(dto);
    if (dto.startAvailability === 'custom_date') {
      assertNotPast(dto.startDate);
    }
    // Deny by default: the same eligibility (verified + licensed state +
    // matching practice) that governs seeing the case governs bidding on
    // it (§2, §4.1). Case status is re-checked below: a participant
    // (e.g. an existing withdrawn bid) can still "see" a since-closed
    // case, but must not be able to bid on it.
    const access = await this.caseAccess.assertCanView(
      { userId: user.sub, role: 'attorney' },
      caseId,
    );
    // Owner 2026-09-30: bids outside the attorney's practices are allowed
    // and marked (the client is warned).
    const outsidePractice = access.kind !== 'owner' && !access.inPractice;
    // §2: bidding needs an active subscription/trial.
    if (!(await this.subscriptions.isActive(user.sub))) {
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'An active subscription or trial is required to bid.',
      });
    }

    try {
      const bid = await withTxRetry(this.prisma, async (tx) => {
        const kase = await tx.case.findUnique({
          where: { id: caseId },
          select: { client_id: true, status: true, deleted_at: true },
        });
        if (!kase || kase.deleted_at) throw notFoundCase();
        if (kase.status !== 'open') {
          throw new ConflictException({
            code: ErrorCode.CASE_INVALID_STATE,
            message: 'This case is no longer accepting bids.',
            details: { status: kase.status },
          });
        }
        const now = new Date();
        const created = await tx.bid.create({
          data: {
            case_id: caseId,
            attorney_id: user.sub,
            status: 'active',
            fee_type: dto.feeType,
            amount_cents: amountCents,
            message: dto.message,
            start_availability: dto.startAvailability,
            start_date: dto.startDate ? new Date(dto.startDate) : null,
            estimated_duration_days: dto.estimatedDurationDays ?? null,
            round_count: 0,
            turn: 'client',
            outside_practice: outsidePractice,
          },
        });
        const offer = await tx.bidOffer.create({
          data: {
            bid_id: created.id,
            round_no: 0,
            from_role: 'attorney',
            fee_type: dto.feeType,
            amount_cents: amountCents,
            message: dto.message,
            status: 'pending',
            created_at: now,
          },
        });
        await tx.case.update({
          where: { id: caseId },
          data: {
            bids_count: { increment: 1 },
            last_activity_at: now,
          },
        });
        await this.journal.append(tx, {
          caseId,
          clientId: kase.client_id,
          actor: { userId: user.sub, role: 'attorney' },
          attorneyId: user.sub,
          event: 'bid_placed',
          payload: {
            bidId: created.id,
            feeType: created.fee_type,
            amountCents: created.amount_cents,
          },
        });
        await this.notifications.emit(
          {
            type: 'bid_received',
            recipientId: kase.client_id,
            payload: { caseId, bidId: created.id, attorneyId: user.sub },
          },
          tx,
        );
        return { ...created, offers: [offer] };
      });
      // OQ-048: the assistant's draft for this case is used up.
      await this.prisma.bidDraft
        .deleteMany({ where: { attorney_id: user.sub, case_id: caseId } })
        .catch(() => undefined);
      return toBidDto(bid);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: ErrorCode.BID_ALREADY_EXISTS,
          message: 'You already have a bid on this case.',
        });
      }
      throw error;
    }
  }

  /** POST /bids/:id/withdraw (§5.3, §6.3) — attorney only, any time the
   * bid is active. On the 5th round with the attorney's turn, this counts
   * as declining a maxed-out negotiation: failed_negotiation (§6.2). */
  async withdraw(user: RequestUser, bidId: string): Promise<BidDto> {
    const bid = await this.loadForActor(bidId, user, 'attorney');
    return this.applyAndRespond(bid.id, 'withdraw', 'attorney', {});
  }

  /** POST /bids/:id/decline (§6.3) — client only. */
  async decline(user: RequestUser, bidId: string): Promise<BidDto> {
    const bid = await this.loadForActor(bidId, user, 'client');
    return this.applyAndRespond(bid.id, 'decline', 'client', {});
  }

  /** POST /bids/:id/counter (§6.1, §6.3) — whichever party's turn it is;
   * unavailable for free_consultation, capped at 5 rounds. */
  async counter(
    user: RequestUser,
    bidId: string,
    dto: CounterOfferDto,
  ): Promise<BidDto> {
    const { bid, by } = await this.loadForEitherParty(bidId, user);
    return this.applyAndRespond(bid.id, 'counter', by, {
      amountCents: dto.amountCents,
      message: dto.message ?? null,
    });
  }

  /** GET /bids/:id (§15) — the bid's two participants only. */
  async get(user: RequestUser, bidId: string): Promise<BidDto> {
    const { bid } = await this.loadForEitherParty(bidId, user);
    const offers = await this.prisma.bidOffer.findMany({
      where: { bid_id: bid.id },
      orderBy: { round_no: 'asc' },
    });
    return toBidDto({ ...bid, offers });
  }

  /**
   * docs/04 §2: "Если подписка адвоката перестала быть активной ...
   * сервис подписок (файл 6) вызывает
   * BidsService.withdrawActiveBidsForAttorney(attorneyId)". Called
   * directly by the future subscriptions webhook (file 06) and, until
   * then, by the hourly BidSubscriptionLapseJob safety net (see
   * jobs/handlers/bid-subscription-lapse.job.ts) so a lapse detected any
   * other way (e.g. the nightly license-expiry job downgrading
   * verification_status, which today's SubscriptionAccessService stub
   * treats as "not active") still withdraws stale active bids.
   */
  async withdrawActiveBidsForAttorney(attorneyId: string): Promise<number> {
    return withTxRetry(this.prisma, async (tx) => {
      const targets = await tx.bid.findMany({
        where: { attorney_id: attorneyId, status: 'active' },
        select: { id: true, case_id: true },
      });
      if (targets.length === 0) return 0;
      const cases = await tx.case.findMany({
        where: { id: { in: targets.map((t) => t.case_id) } },
        select: { id: true, client_id: true },
      });
      const clientOf = new Map(cases.map((c) => [c.id, c.client_id]));
      const results = await this.bidMachine.applyToActive(
        tx,
        { attorneyId },
        'system_withdraw',
      );
      for (const r of results) {
        const clientId = clientOf.get(r.case_id);
        if (!clientId) continue; // defensive: case row vanished mid-transaction
        await this.journal.append(tx, {
          caseId: r.case_id,
          clientId,
          actor: { userId: null, role: null },
          attorneyId,
          event: r.plan.event,
          payload: { bidId: r.id, reason: 'subscription_lapsed' },
        });
        await this.notifications.emit(
          {
            type: 'bid_rejected',
            recipientId: clientId,
            payload: { caseId: r.case_id, bidId: r.id, reason: 'withdrawn' },
          },
          tx,
        );
      }
      return results.length;
    });
  }

  private async applyAndRespond(
    bidId: string,
    action: 'withdraw' | 'decline' | 'counter',
    by: PartyRole,
    extra: { amountCents?: number; message?: string | null },
  ): Promise<BidDto> {
    const chat: ChatChange[] = [];
    const result = await withTxRetry(this.prisma, async (tx) => {
      chat.length = 0;
      const before = await tx.bid.findUnique({
        where: { id: bidId },
        select: { case_id: true, attorney_id: true },
      });
      if (!before) throw bidNotFound();
      const kase = await tx.case.findUniqueOrThrow({
        where: { id: before.case_id },
        select: { client_id: true },
      });
      const { bid, plan } = await this.bidMachine.apply(tx, {
        bidId,
        action,
        by,
        amountCents: extra.amountCents,
        message: extra.message,
      });
      await this.journal.append(tx, {
        caseId: before.case_id,
        clientId: kase.client_id,
        actor: {
          userId: by === 'client' ? kase.client_id : before.attorney_id,
          role: by,
        },
        attorneyId: before.attorney_id,
        event: plan.event,
        payload: {
          bidId,
          action,
          to: plan.to,
          ...(extra.amountCents !== undefined
            ? { amountCents: extra.amountCents }
            : {}),
        },
      });
      await this.notifyOutcome({
        caseId: before.case_id,
        attorneyId: before.attorney_id,
        clientId: kase.client_id,
        bidId,
        action,
        by,
        plan,
        tx,
      });
      if (action !== 'counter') {
        // docs/05 §8.2 "Стороны не договорились" in their chat, if any.
        chat.push(
          ...(await this.chat.post(
            tx,
            {
              case_id: before.case_id,
              attorney_id: before.attorney_id,
              status: { not: 'closed' },
            },
            'no_agreement',
          )),
        );
      }
      const offers = await tx.bidOffer.findMany({
        where: { bid_id: bidId },
        orderBy: { round_no: 'asc' },
      });
      return { ...bid, offers };
    });
    this.chat.publish(chat);
    return toBidDto(result);
  }

  private async notifyOutcome(input: {
    caseId: string;
    attorneyId: string;
    clientId: string;
    bidId: string;
    action: 'withdraw' | 'decline' | 'counter';
    by: PartyRole;
    plan: { to: string; event: string };
    tx: Prisma.TransactionClient;
  }): Promise<void> {
    const { caseId, attorneyId, clientId, bidId, action, by, plan, tx } = input;
    if (plan.to === 'failed_negotiation') {
      // §6.2: both sides, "Стороны не договорились" (notif.bids.* text,
      // file 05 delivery).
      for (const recipientId of [clientId, attorneyId]) {
        await this.notifications.emit(
          {
            type: 'negotiation_failed',
            recipientId,
            payload: { caseId, bidId },
          },
          tx,
        );
      }
      return;
    }
    if (action === 'counter') {
      const recipientId = by === 'client' ? attorneyId : clientId;
      await this.notifications.emit(
        {
          type: 'offer_countered',
          recipientId,
          payload: { caseId, bidId, byRole: by },
        },
        tx,
      );
      return;
    }
    if (action === 'decline') {
      // plan.to === 'rejected_by_client' here (failed_negotiation handled above).
      await this.notifications.emit(
        {
          type: 'bid_rejected',
          recipientId: attorneyId,
          payload: { caseId, bidId, reason: 'rejected_by_client' },
        },
        tx,
      );
      return;
    }
    // action === 'withdraw', plan.to === 'withdrawn'.
    await this.notifications.emit(
      {
        type: 'bid_rejected',
        recipientId: clientId,
        payload: { caseId, bidId, reason: 'withdrawn' },
      },
      tx,
    );
  }

  /** Loads a bid and asserts `user` is the single party allowed to act as
   * `expected` (deny by default: anyone else, including the other party,
   * gets 404 — a foreign bid is indistinguishable from a missing one). */
  private async loadForActor(
    bidId: string,
    user: RequestUser,
    expected: 'client' | 'attorney',
  ): Promise<Bid> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: { case: { select: { client_id: true, status: true } } },
    });
    if (!bid) throw bidNotFound();
    const isMatch =
      expected === 'attorney'
        ? user.role === 'attorney' && bid.attorney_id === user.sub
        : user.role === 'client' && bid.case.client_id === user.sub;
    if (!isMatch) throw bidNotFound();
    return bid;
  }

  private async loadForEitherParty(
    bidId: string,
    user: RequestUser,
  ): Promise<{ bid: BidWithCase; by: PartyRole }> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: { case: { select: { client_id: true, status: true } } },
    });
    if (!bid) throw bidNotFound();
    if (user.role === 'client' && bid.case.client_id === user.sub) {
      return { bid, by: 'client' };
    }
    if (user.role === 'attorney' && bid.attorney_id === user.sub) {
      return { bid, by: 'attorney' };
    }
    throw bidNotFound();
  }
}

export function normalizeAmount(dto: CreateBidDto): number {
  if (dto.feeType === 'free_consultation') return 0;
  if (dto.amountCents === undefined || dto.amountCents <= 0) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'amountCents is required for fixed and hourly bids.',
      details: { fields: ['amountCents'] },
    });
  }
  return dto.amountCents;
}

export function assertNotPast(startDate: string | undefined): void {
  if (!startDate) return;
  const day = new Date(`${startDate}T00:00:00.000Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (day.getTime() < today.getTime()) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'startDate cannot be in the past.',
      details: { fields: ['startDate'] },
    });
  }
}

function notFoundCase(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CASE_NOT_FOUND,
    message: 'Case not found.',
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/** Response shape shared with stage 4.5 (BidAcceptanceService). */
export function toBidDto(bid: BidWithOffers): BidDto {
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
    decidedAt: bid.decided_at?.toISOString() ?? null,
    createdAt: bid.created_at.toISOString(),
    offers: bid.offers
      .slice()
      .sort((a, b) => a.round_no - b.round_no)
      .map((o) => ({
        id: o.id,
        roundNo: o.round_no,
        fromRole: o.from_role,
        feeType: o.fee_type,
        amountCents: o.amount_cents,
        message: o.message,
        status: o.status,
        createdAt: o.created_at.toISOString(),
      })),
  };
}
