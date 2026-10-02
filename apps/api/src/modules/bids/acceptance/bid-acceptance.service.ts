import { assertNoBlockBetween } from '../../blocks/block-check';
import { ConflictException, Injectable } from '@nestjs/common';
import type { PartyRole, Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import type { RequestMeta } from '../../auth/services/session.service';
import {
  CaseStateMachine,
  caseInvalidState,
  caseNotFound,
} from '../../cases/domain/case-state-machine';
import {
  ChatSystemMessages,
  type ChatChange,
} from '../../chat/chat-system.service';
import { CaseJournalService } from '../../journal/case-journal.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SubscriptionAccessService } from '../../subscriptions/subscription-access.service';
import {
  BidStateMachine,
  bidNotFound,
  planBidTransition,
} from '../domain/bid-state-machine';
import { toBidDto } from '../bids.service';
import type { BidDto } from '../dto/bid-responses.dto';
import { disclosedFieldsOf } from './contact-disclosure.util';

/** docs/04 §7 step 8: why the losing bids were rejected. */
export const REJECT_REASON_ANOTHER_BID = 'another_bid_accepted';
/** docs/04 §7 step 2: why an ineligible attorney's bid was withdrawn. */
export const WITHDRAW_REASON_ATTORNEY_INACTIVE = 'attorney_inactive';

/**
 * Thrown inside the accept transaction when the bid's attorney fails the
 * §7 step 2 re-check, so the transaction rolls back untouched and the
 * caller withdraws the bid in its own (committed) transaction before
 * answering BID_ATTORNEY_INACTIVE.
 */
class AttorneyInactive extends Error {
  constructor(readonly why: 'not_verified' | 'no_license' | 'no_subscription') {
    super(`attorney inactive: ${why}`);
  }
}

/**
 * docs/04_CASES_BIDS.md §7 (stage 4.5) — accepting a bid, the critical
 * transaction. ONE withTxRetry transaction that locks the case row
 * (`SELECT … FOR UPDATE`) and the bid row (BidStateMachine.apply), so two
 * parallel accepts on the same case run one after the other: the first
 * wins, the second finds the case `in_progress` and gets
 * CASE_INVALID_STATE (§7 "Параллельное принятие двух бидов ...").
 *
 * Every status change goes through the state machines (.cursorrules); the
 * journal rows (`bid_accepted`, `contacts_disclosed`, `bid_rejected` per
 * losing bid) are appended via CaseJournalService.append() in the same
 * transaction; the contact_disclosures row (§8.2) and the conversation
 * with contacts_unlocked (§9) are written there too. Notification rows
 * commit with the transaction (NotificationsService seam; delivery is
 * docs/05).
 */
@Injectable()
export class BidAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bidMachine: BidStateMachine,
    private readonly caseMachine: CaseStateMachine,
    private readonly journal: CaseJournalService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly chat: ChatSystemMessages,
  ) {}

  /** POST /bids/:id/accept — the client accepts the attorney's offer, or
   * the attorney accepts the client's counter-offer (§6.3: whoever's turn
   * it is). Anyone else gets 404 (deny by default, as in BidsService). */
  async accept(
    user: RequestUser,
    bidId: string,
    meta: RequestMeta,
  ): Promise<BidDto> {
    const by = await this.partyOf(user, bidId);
    const chat: ChatChange[] = [];
    try {
      const result = await withTxRetry(this.prisma, (tx) => {
        chat.length = 0;
        return this.acceptInTx(tx, bidId, by, user.sub, meta, chat);
      });
      this.chat.publish(chat);
      return toBidDto(result);
    } catch (error) {
      if (error instanceof AttorneyInactive) {
        await this.withdrawInactive(bidId, error.why);
        throw new ConflictException({
          code: ErrorCode.BID_ATTORNEY_INACTIVE,
          message:
            'This attorney is no longer available. Please choose another bid.',
          details: { reason: error.why },
        });
      }
      throw error;
    }
  }

  private async acceptInTx(
    tx: Prisma.TransactionClient,
    bidId: string,
    by: PartyRole,
    actorId: string,
    meta: RequestMeta,
    chat: ChatChange[],
  ) {
    const now = new Date();
    const ref = await tx.bid.findUnique({
      where: { id: bidId },
      select: { case_id: true, attorney_id: true },
    });
    if (!ref) throw bidNotFound();
    const { case_id: caseId, attorney_id: attorneyId } = ref;

    // §7 step 1: the case row first (every accept on this case queues
    // here), then the bid row inside BidStateMachine.apply.
    await tx.$queryRaw`SELECT id FROM cases WHERE id = ${caseId}::UUID FOR UPDATE`;
    const kase = await tx.case.findUnique({
      where: { id: caseId },
      select: {
        client_id: true,
        status: true,
        states: { select: { state_code: true } },
      },
    });
    // Owner 2026-10-02: no deal across a block (either way).
    if (kase) await assertNoBlockBetween(tx, kase.client_id, attorneyId);
    if (!kase) throw caseNotFound();
    // §7 step 2 — case `open`, checked before touching the bid so the
    // loser of a race sees CASE_INVALID_STATE, not the auto-rejected
    // bid's BID_INVALID_STATE.
    if (kase.status !== 'open')
      throw caseInvalidState('accept_bid', kase.status);
    const clientId = kase.client_id;

    await tx.$queryRaw`SELECT id FROM bids WHERE id = ${bidId}::UUID FOR UPDATE`;
    const bid = await tx.bid.findUniqueOrThrow({ where: { id: bidId } });
    // Bid `active` and the caller's turn (BID_INVALID_STATE /
    // BID_NOT_YOUR_TURN) — the machine's own pure check, run before the
    // eligibility re-check so a finished bid never gets "withdrawn".
    planBidTransition(bid, 'accept', by, now);

    // §7 step 2 — the attorney must still be verified, licensed in a
    // state of the case and subscribed at the moment of acceptance.
    const profile = await tx.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: { verification_status: true },
    });
    if (profile?.verification_status !== 'verified') {
      throw new AttorneyInactive('not_verified');
    }
    const license = await tx.attorneyLicense.findFirst({
      where: {
        attorney_id: attorneyId,
        license_status: 'verified',
        state_code: { in: kase.states.map((s) => s.state_code) },
      },
      select: { id: true },
    });
    if (!license) throw new AttorneyInactive('no_license');
    if (!(await this.subscriptions.isActive(attorneyId, tx))) {
      throw new AttorneyInactive('no_subscription');
    }

    // §7 step 3: pending offer → accepted, bid → accepted, decided_at.
    const { bid: accepted, plan } = await this.bidMachine.apply(tx, {
      bidId,
      action: 'accept',
      by,
      now,
    });
    // §7 step 4: case → in_progress, accepted_bid_id, last_activity_at.
    const { plan: casePlan } = await this.caseMachine.apply(tx, {
      caseId,
      action: 'accept_bid',
      acceptedBidId: bidId,
      now,
    });
    // §7 step 5: every other active bid → rejected_auto, its pending
    // offer → superseded.
    const rejected = await this.bidMachine.applyToActive(
      tx,
      { caseId, exceptBidId: bidId },
      'auto_reject',
      now,
    );

    // §7 step 6 / §9: the conversation between the two, contacts
    // unlocked. Other attorneys' pre-acceptance chats on this case close
    // (§9 "Если кейс принят другим адвокатом ... переводятся в closed").
    const conversation = await tx.conversation.upsert({
      where: {
        case_id_attorney_id: { case_id: caseId, attorney_id: attorneyId },
      },
      create: {
        case_id: caseId,
        attorney_id: attorneyId,
        client_id: clientId,
        bid_id: bidId,
        status: 'active',
        contacts_unlocked: true,
      },
      update: { bid_id: bidId, status: 'active', contacts_unlocked: true },
      select: { id: true },
    });
    await tx.conversationParticipant.createMany({
      data: [
        { conversation_id: conversation.id, user_id: clientId },
        { conversation_id: conversation.id, user_id: attorneyId },
      ],
      skipDuplicates: true,
    });
    // docs/05 §8.2 system messages: "Предложение принято, контакты
    // открыты" here; "Кейс принят другим адвокатом…" (read-only) in the
    // others' pre-acceptance chats.
    chat.push(
      ...(await this.chat.post(tx, { id: conversation.id }, 'offer_accepted')),
      ...(await this.chat.post(
        tx,
        {
          case_id: caseId,
          attorney_id: { not: attorneyId },
          status: 'pre_acceptance',
        },
        'accepted_by_other',
        { close: true },
      )),
    );

    // §7 step 7 / §8.2: the append-only disclosure record (who, when,
    // which fields, IP and device). UQ contact_disclosures(bid_id): a bid
    // is accepted once, so this can't double up.
    const client = await tx.user.findUniqueOrThrow({
      where: { id: clientId },
      select: {
        first_name: true,
        last_name: true,
        phone_e164: true,
        email: true,
        client_profile: {
          select: {
            preferred_contact_method: true,
            preferred_contact_note: true,
          },
        },
      },
    });
    const fields = disclosedFieldsOf(client);
    const disclosure = await tx.contactDisclosure.create({
      data: {
        case_id: caseId,
        bid_id: bidId,
        client_id: clientId,
        attorney_id: attorneyId,
        fields,
        ip: meta.ip ?? null,
        device_id: meta.deviceId ?? null,
        disclosed_at: now,
      },
      select: { id: true },
    });

    // §7 step 8: journal rows.
    const actor = { userId: actorId, role: by };
    await this.journal.append(tx, {
      caseId,
      clientId,
      actor,
      attorneyId,
      event: plan.event, // bid_accepted (== casePlan.event)
      payload: {
        bidId,
        feeType: accepted.fee_type,
        amountCents: accepted.amount_cents,
        roundNo: accepted.round_count,
        acceptedBy: by,
        caseStatus: casePlan.to,
        conversationId: conversation.id,
      },
    });
    await this.journal.append(tx, {
      caseId,
      clientId,
      actor,
      attorneyId,
      event: 'contacts_disclosed',
      payload: {
        bidId,
        disclosureId: disclosure.id,
        fields,
        ip: meta.ip ?? null,
        deviceId: meta.deviceId ?? null,
      },
    });
    for (const r of rejected) {
      await this.journal.append(tx, {
        caseId,
        clientId,
        actor,
        attorneyId: r.attorney_id,
        event: r.plan.event, // bid_rejected
        payload: { bidId: r.id, reason: REJECT_REASON_ANOTHER_BID },
      });
    }

    // §7 step 9 / §13: the winner (or the client, when the attorney took
    // the counter-offer) and every rejected attorney.
    await this.notifications.emit(
      by === 'client'
        ? {
            type: 'bid_accepted',
            recipientId: attorneyId,
            payload: { caseId, bidId },
          }
        : {
            type: 'offer_accepted',
            recipientId: clientId,
            payload: { caseId, bidId, attorneyId },
          },
      tx,
    );
    for (const r of rejected) {
      await this.notifications.emit(
        {
          type: 'bid_rejected',
          recipientId: r.attorney_id,
          payload: { caseId, bidId: r.id, reason: REJECT_REASON_ANOTHER_BID },
        },
        tx,
      );
    }

    const offers = await tx.bidOffer.findMany({
      where: { bid_id: bidId },
      orderBy: { round_no: 'asc' },
    });
    return { ...accepted, offers };
  }

  /** §7 step 2: the accept transaction rolled back; the ineligible
   * attorney's bid is withdrawn (system action) and the client told. */
  private async withdrawInactive(
    bidId: string,
    why: AttorneyInactive['why'],
  ): Promise<void> {
    await withTxRetry(this.prisma, async (tx) => {
      const ref = await tx.bid.findUnique({
        where: { id: bidId },
        select: {
          case_id: true,
          attorney_id: true,
          status: true,
          case: { select: { client_id: true } },
        },
      });
      if (!ref || ref.status !== 'active') return; // raced: already final
      const { plan } = await this.bidMachine.apply(tx, {
        bidId,
        action: 'system_withdraw',
        by: 'system',
      });
      await this.journal.append(tx, {
        caseId: ref.case_id,
        clientId: ref.case.client_id,
        actor: { userId: null, role: null },
        attorneyId: ref.attorney_id,
        event: plan.event,
        payload: { bidId, reason: WITHDRAW_REASON_ATTORNEY_INACTIVE, why },
      });
      await this.notifications.emit(
        {
          type: 'bid_rejected',
          recipientId: ref.case.client_id,
          payload: { caseId: ref.case_id, bidId, reason: 'withdrawn' },
        },
        tx,
      );
    });
  }

  /** Which party the caller is on this bid; anyone else is 404. */
  private async partyOf(user: RequestUser, bidId: string): Promise<PartyRole> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { attorney_id: true, case: { select: { client_id: true } } },
    });
    if (!bid) throw bidNotFound();
    if (user.role === 'client' && bid.case.client_id === user.sub) {
      return 'client';
    }
    if (user.role === 'attorney' && bid.attorney_id === user.sub) {
      return 'attorney';
    }
    throw bidNotFound();
  }
}
