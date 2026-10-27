import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { CasePayment } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type {
  PaymentProvider,
  ProviderDispute,
} from '../billing/payment-provider';
import { NotificationsService } from '../notifications/notifications.service';
import { renderDisputePacketPdf } from './dispute-packet.pdf';
import {
  buildEvidenceFields,
  disputeOpen,
  disputeRate,
  evidenceDocumentLines,
  reminderDue,
  type DisputeRate,
  type EvidenceFacts,
} from './stripe-ops.helpers';
import { StripeReviewService } from './stripe-review.service';

const DAY_MS = 86_400_000;
const RATE_WINDOW_DAYS = 30;

/**
 * Stripe robustness 2026-10-27: the dispute side of the review queue.
 *
 *  - evidence: when a dispute opens we assemble the packet from our own
 *    records and save it in Stripe as a DRAFT (Stripe's dispute evidence API,
 *    `evidence[...]` without `submit`). An admin reviews it in the queue and
 *    submits it with one 2FA code. Stripe's Smart Disputes (Dashboard →
 *    Settings → Disputes) stays the first line for eligible card disputes.
 *  - payouts: while a dispute against an attorney is open, that attorney's
 *    Stripe payout schedule is set to manual (setting
 *    `stripe_ops.hold_payouts_on_dispute`) and restored when the last one
 *    closes.
 *  - reminders: staff and the attorney are told as Stripe's deadline nears.
 *  - rate: disputes / payments over 30 days against the Visa / Mastercard
 *    program thresholds.
 */
@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly review: StripeReviewService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly pino?: PinoLogger,
  ) {}

  // ---- webhook side ------------------------------------------------------------

  /** A dispute event for a case payment (already stored by the caller). */
  async onCaseDispute(
    row: CasePayment,
    d: {
      id: string;
      status: string;
      reason?: string;
      amount?: number;
      dueBy?: number | null;
    },
    isNew: boolean,
  ): Promise<void> {
    const open = disputeOpen(d.status);
    const dueAt = d.dueBy ? new Date(d.dueBy * 1000) : null;
    if (open) {
      await this.review.open({
        kind: 'dispute',
        stripeRef: d.id,
        casePaymentId: row.id,
        userId: row.attorney_id,
        amountCents: d.amount ?? row.client_total_cents,
        currency: row.currency,
        summary: `Dispute (${d.reason ?? 'unknown'}) on a client payment of ${((d.amount ?? row.client_total_cents) / 100).toFixed(2)} ${row.currency.toUpperCase()}: respond in Stripe by ${dueAt ? dueAt.toISOString().slice(0, 10) : 'the deadline'}.`,
        details: {
          status: d.status,
          reason: d.reason ?? null,
          scope: 'connect',
        },
        dueAt,
      });
      if (isNew) {
        await this.holdPayouts(row);
        if (await this.settings.boolean('stripe_ops.dispute_auto_draft')) {
          await this.buildDraft(row.id).catch((e) =>
            this.logger.warn(`dispute draft failed: ${String(e)}`),
          );
        }
      }
    } else {
      await this.review.closeByRef(
        'dispute',
        d.id,
        `Dispute closed by the bank: ${d.status}`,
      );
      await this.releasePayouts(row.attorney_id);
    }
  }

  /** A dispute on the platform's own charge (subscription, pack, boost). */
  async onPlatformDispute(
    d: {
      id: string;
      status: string;
      reason?: string;
      amount?: number;
      currency?: string;
      dueBy?: number | null;
    },
    paymentIntentId: string | null,
  ): Promise<void> {
    const dueAt = d.dueBy ? new Date(d.dueBy * 1000) : null;
    const pay = paymentIntentId
      ? await this.prisma.payment.findFirst({
          where: { stripe_payment_intent_id: paymentIntentId },
          select: { user_id: true },
        })
      : null;
    if (disputeOpen(d.status)) {
      await this.review.open({
        kind: 'dispute',
        stripeRef: d.id,
        userId: pay?.user_id ?? null,
        amountCents: d.amount ?? null,
        currency: d.currency ?? 'usd',
        summary: `Dispute (${d.reason ?? 'unknown'}) on a LawBid charge: respond in the Stripe Dashboard by ${dueAt ? dueAt.toISOString().slice(0, 10) : 'the deadline'}.`,
        details: {
          status: d.status,
          reason: d.reason ?? null,
          scope: 'platform',
        },
        dueAt,
      });
    } else {
      await this.review.closeByRef(
        'dispute',
        d.id,
        `Dispute closed by the bank: ${d.status}`,
      );
    }
  }

  // ---- evidence ---------------------------------------------------------------

  /** Gathers what our records prove about one case payment. */
  async gatherFacts(paymentId: string): Promise<EvidenceFacts> {
    const p = await this.prisma.casePayment.findUnique({
      where: { id: paymentId },
    });
    if (!p) throw new NotFoundException('payment not found');
    const [kase, client, attorney, req, refunds, convs] = await Promise.all([
      this.prisma.case.findUnique({
        where: { id: p.case_id },
        select: {
          id: true,
          title: true,
          created_at: true,
          accepted_bid_id: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: p.client_id },
        select: { first_name: true, last_name: true, email: true },
      }),
      this.prisma.user.findUnique({
        where: { id: p.attorney_id },
        select: { first_name: true, last_name: true },
      }),
      p.request_id
        ? this.prisma.paymentRequest.findUnique({
            where: { id: p.request_id },
            select: { description: true, created_at: true },
          })
        : null,
      this.prisma.casePaymentRefund.findMany({
        where: { payment_id: p.id, status: 'succeeded' },
        select: { amount_cents: true },
      }),
      this.prisma.conversation.findMany({
        where: { case_id: p.case_id },
        select: { id: true },
      }),
    ]);
    const bid = kase?.accepted_bid_id
      ? await this.prisma.bid.findUnique({
          where: { id: kase.accepted_bid_id },
          select: { created_at: true, updated_at: true },
        })
      : null;
    const convIds = convs.map((c) => c.id);
    const msgs = convIds.length
      ? await this.prisma.message.findMany({
          where: { conversation_id: { in: convIds } },
          select: { sender_id: true, type: true, created_at: true },
        })
      : [];
    const calls = convIds.length
      ? await this.prisma.call.findMany({
          where: { conversation_id: { in: convIds } },
          select: { duration_sec: true },
        })
      : [];
    const consents = await this.prisma.userConsent.findMany({
      where: {
        user_id: p.client_id,
        created_at: { lte: p.paid_at ?? new Date() },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: { consent_type: true, granted: true, created_at: true, ip: true },
    });
    const session = await this.prisma.session.findFirst({
      where: {
        user_id: p.client_id,
        created_at: { lte: p.paid_at ?? new Date() },
        ip: { not: null },
      },
      orderBy: { created_at: 'desc' },
      select: { ip: true },
    });
    const times = msgs.map((m) => m.created_at.getTime());
    const nameOf = (
      u: { first_name: string | null; last_name: string | null } | null,
    ) =>
      u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null : null;
    return {
      paymentId: p.id,
      caseTitle: kase?.title ?? 'n/a',
      caseId: p.case_id,
      amountCents: p.amount_cents,
      clientTotalCents: p.client_total_cents,
      currency: p.currency,
      paidAt: p.paid_at,
      clientName: nameOf(client),
      clientEmail: client?.email ?? null,
      attorneyName: nameOf(attorney),
      bidAcceptedAt: bid?.updated_at ?? null,
      caseCreatedAt: kase?.created_at ?? null,
      receiptUrl: p.receipt_url,
      purchaseIp: session?.ip ?? null,
      consents: consents.map((c) => ({
        type: c.consent_type,
        granted: c.granted,
        at: c.created_at,
        ip: c.ip,
      })),
      chat: {
        messages: msgs.filter((m) => m.type !== 'system').length,
        clientMessages: msgs.filter((m) => m.sender_id === p.client_id).length,
        attorneyMessages: msgs.filter((m) => m.sender_id === p.attorney_id)
          .length,
        attachments: msgs.filter((m) => m.type === 'attachment').length,
        voiceNotes: msgs.filter((m) => m.type === 'voice').length,
        firstAt: times.length ? new Date(Math.min(...times)) : null,
        lastAt: times.length ? new Date(Math.max(...times)) : null,
      },
      calls: {
        count: calls.length,
        totalSeconds: calls.reduce((s, c) => s + (c.duration_sec ?? 0), 0),
      },
      request: req
        ? { description: req.description, sentAt: req.created_at }
        : null,
      refundedCents: refunds.reduce((s, r) => s + r.amount_cents, 0),
    };
  }

  /** Saves the packet in Stripe as a draft (never submits). Idempotent. */
  async buildDraft(paymentId: string): Promise<{ saved: boolean }> {
    const p = await this.prisma.casePayment.findUnique({
      where: { id: paymentId },
    });
    if (!p?.dispute_id || !this.provider?.updateDisputeEvidence) {
      return { saved: false };
    }
    const accountId = p.stripe_account_id;
    const facts = await this.gatherFacts(paymentId);
    const evidence = buildEvidenceFields(facts);
    if (this.provider.uploadEvidenceFile) {
      try {
        const pdf = await renderDisputePacketPdf(evidenceDocumentLines(facts));
        evidence.service_documentation = await this.provider.uploadEvidenceFile(
          {
            accountId,
            filename: `lawbid-dispute-${p.id.slice(0, 8)}.pdf`,
            mime: 'application/pdf',
            data: pdf,
          },
        );
      } catch (e) {
        this.logger.warn(`evidence file upload failed: ${String(e)}`);
      }
    }
    await this.provider.updateDisputeEvidence({
      accountId,
      disputeId: p.dispute_id,
      evidence,
      submit: false,
    });
    await this.prisma.casePayment.update({
      where: { id: p.id },
      data: { dispute_evidence_status: 'draft' },
    });
    return { saved: true };
  }

  /** Admin (after 2FA): send the draft to the bank. Cannot be undone. */
  async submit(paymentId: string): Promise<ProviderDispute> {
    const p = await this.prisma.casePayment.findUnique({
      where: { id: paymentId },
    });
    if (!p?.dispute_id)
      throw new NotFoundException('no dispute on this payment');
    if (
      !this.provider?.retrieveDispute ||
      !this.provider.updateDisputeEvidence
    ) {
      throw new ConflictException('Stripe is not configured');
    }
    const current = await this.provider.retrieveDispute(
      p.stripe_account_id,
      p.dispute_id,
    );
    if (!current || !disputeOpen(current.status) || current.pastDue) {
      throw new ConflictException('This dispute can no longer be answered.');
    }
    if (p.dispute_evidence_status !== 'draft') await this.buildDraft(p.id);
    const sent = await this.provider.updateDisputeEvidence({
      accountId: p.stripe_account_id,
      disputeId: p.dispute_id,
      evidence: {},
      submit: true,
    });
    await this.prisma.casePayment.update({
      where: { id: p.id },
      data: { dispute_evidence_status: 'submitted' },
    });
    await this.review.closeByRef(
      'dispute',
      p.dispute_id,
      'Evidence submitted to the bank',
    );
    return sent;
  }

  // ---- payouts ------------------------------------------------------------------

  async holdPayouts(
    row: Pick<CasePayment, 'attorney_id' | 'stripe_account_id'>,
  ) {
    if (!(await this.settings.boolean('stripe_ops.hold_payouts_on_dispute'))) {
      return;
    }
    if (!row.stripe_account_id || !this.provider?.setConnectPayoutsHeld) return;
    try {
      await this.provider.setConnectPayoutsHeld(
        row.stripe_account_id,
        true,
        null,
      );
      await this.prisma.payoutAccount.updateMany({
        where: { user_id: row.attorney_id },
        data: {
          payouts_held: true,
          payouts_hold_reason: 'dispute open',
          payouts_held_at: new Date(),
        },
      });
    } catch (e) {
      this.logger.warn(`payout hold failed: ${String(e)}`);
    }
  }

  /** Restores the payout schedule once no dispute against the attorney is open. */
  async releasePayouts(attorneyId: string): Promise<void> {
    const acct = await this.prisma.payoutAccount.findUnique({
      where: { user_id: attorneyId },
      select: { stripe_account_id: true, payouts_held: true },
    });
    if (!acct?.payouts_held || !this.provider?.setConnectPayoutsHeld) return;
    const stillOpen = await this.prisma.casePayment.count({
      where: {
        attorney_id: attorneyId,
        status: 'disputed',
        NOT: { dispute_status: { in: ['won', 'lost', 'warning_closed'] } },
      },
    });
    if (stillOpen > 0) return;
    try {
      const trust = await this.prisma.attorneyTrust.findUnique({
        where: { attorney_id: attorneyId },
        select: { payout_delay_days: true, payout_delay_synced_at: true },
      });
      const days = trust?.payout_delay_synced_at
        ? trust.payout_delay_days
        : null;
      await this.provider.setConnectPayoutsHeld(
        acct.stripe_account_id,
        false,
        days,
      );
      await this.prisma.payoutAccount.update({
        where: { user_id: attorneyId },
        data: {
          payouts_held: false,
          payouts_hold_reason: null,
          payouts_held_at: null,
        },
      });
    } catch (e) {
      this.logger.warn(`payout release failed: ${String(e)}`);
    }
  }

  // ---- jobs ------------------------------------------------------------------------

  /** Hourly: remind staff and the attorney as Stripe's deadline nears. */
  async remindDeadlines(now = new Date()): Promise<{ reminded: number }> {
    const days = await this.settings.numberList(
      'stripe_ops.dispute_reminder_days',
    );
    const items = await this.prisma.stripeReviewItem.findMany({
      where: { kind: 'dispute', status: 'open', due_at: { not: null } },
    });
    let reminded = 0;
    for (const it of items) {
      if (!it.due_at) continue;
      if (
        !reminderDue({
          dueAt: it.due_at,
          now,
          remindedAt: it.reminded_at,
          days,
        })
      ) {
        continue;
      }
      const left = Math.max(
        0,
        Math.round((it.due_at.getTime() - now.getTime()) / DAY_MS),
      );
      await this.review.notifyStaff(
        `deadline:${it.id}:${now.toISOString().slice(0, 10)}`,
        'LawBid Stripe: dispute deadline',
        `${it.summary}\n\nAbout ${left} day(s) left. Admin → Деньги → «Проверки Stripe».`,
      );
      const details =
        it.details &&
        typeof it.details === 'object' &&
        !Array.isArray(it.details)
          ? (it.details as Record<string, unknown>)
          : {};
      if (it.user_id && details.scope === 'connect' && this.notifications) {
        try {
          await this.notifications.emit({
            type: 'case_payment_disputed',
            recipientId: it.user_id,
            payload: {
              paymentId: it.case_payment_id,
              reminder: true,
              daysLeft: left,
            },
          });
        } catch (e) {
          this.logger.warn(`attorney reminder failed: ${String(e)}`);
        }
      }
      await this.prisma.stripeReviewItem.update({
        where: { id: it.id },
        data: { reminded_at: now },
      });
      reminded += 1;
    }
    return { reminded };
  }

  /** Disputes / payments over 30 days against the card-network programs. */
  async rate(now = new Date()): Promise<DisputeRate> {
    const since = new Date(now.getTime() - RATE_WINDOW_DAYS * DAY_MS);
    const [caseDisputes, platformDisputes, casePaid, platformPaid] =
      await Promise.all([
        this.prisma.casePayment.count({
          where: { disputed_at: { gte: since } },
        }),
        this.prisma.stripeReviewItem.count({
          where: {
            kind: 'dispute',
            case_payment_id: null,
            opened_at: { gte: since },
          },
        }),
        this.prisma.casePayment.count({ where: { paid_at: { gte: since } } }),
        this.prisma.payment.count({
          where: { status: 'succeeded', paid_at: { gte: since } },
        }),
      ]);
    const [warn, alarm, minCount] = await Promise.all([
      this.settings.number('stripe_ops.dispute_rate_warn_percent'),
      this.settings.number('stripe_ops.dispute_rate_alarm_percent'),
      this.settings.number('stripe_ops.dispute_rate_min_count'),
    ]);
    return disputeRate({
      disputes: caseDisputes + platformDisputes,
      payments: casePaid + platformPaid,
      warnPercent: warn,
      alarmPercent: alarm,
      minCount,
    });
  }

  /** Nightly: log `alert: dispute_rate` (the CloudWatch filter) and mail staff. */
  async checkRate(now = new Date()): Promise<DisputeRate> {
    const r = await this.rate(now);
    if (r.level !== 'ok') {
      // The CloudWatch filter `alert = dispute_rate` pages the owner.
      this.pino?.warn(
        {
          alert: 'dispute_rate',
          level: r.level,
          ratePercent: r.ratePercent,
          disputes: r.disputes,
          payments: r.payments,
        },
        `dispute rate ${r.ratePercent}% (${r.level})`,
      );
      await this.review.notifyStaff(
        `rate:${now.toISOString().slice(0, 10)}`,
        `LawBid Stripe: dispute rate ${r.ratePercent}% (${r.level})`,
        `${r.disputes} disputes in ${r.payments} payments over 30 days = ${r.ratePercent}%.\nVisa VAMP: 0.5% non-compliant, 1.5% excessive. Mastercard ECM: 1.5% and 100 disputes.\nSee docs/runbooks/STRIPE_ROBUSTNESS.md.`,
      );
    }
    return r;
  }
}
