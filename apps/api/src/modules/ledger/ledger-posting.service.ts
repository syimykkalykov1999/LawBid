import { Injectable } from '@nestjs/common';
import { LedgerService, type LedgerDb } from './ledger.service';
import {
  bankPayoutLines,
  casePaymentLines,
  casePaymentRefundLines,
  expensePaidLines,
  platformChargeLines,
  reverseProportional,
  stripeFeeLines,
  suspenseLines,
  type Line,
  type PlatformRevenue,
} from './ledger.recipes';

/** The columns of a `payments` row the ledger needs. */
export interface PaymentFacts {
  id: string;
  user_id: string;
  amount_cents: number;
  tax_cents?: number | null;
  currency: string;
  paid_at?: Date | null;
  stripe_payment_intent_id?: string | null;
}

/** The columns of a `case_payments` row the ledger needs. */
export interface CasePaymentFacts {
  id: string;
  attorney_id: string;
  client_total_cents: number;
  platform_fee_cents: number;
  attorney_net_cents: number;
  currency: string;
  paid_at?: Date | null;
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
}

const PAYMENT_REFUND_TYPES = ['payment_refund', 'payment_refund_sync'];

/**
 * One method per money event the app has (the "recipes" with the database
 * around them). Every method takes the caller's transaction client: the
 * event and its ledger entry commit together. All are idempotent.
 */
@Injectable()
export class LedgerPostingService {
  constructor(private readonly ledger: LedgerService) {}

  /** The platform's own Stripe charge succeeded (invoice, pack, stars, promotion). */
  paymentReceived(
    db: LedgerDb,
    p: PaymentFacts,
    target: PlatformRevenue,
  ): Promise<{ created: boolean }> {
    return this.ledger.post(db, {
      sourceType: 'payment',
      sourceId: p.id,
      event: 'paid',
      currency: p.currency,
      description: `Payment received (${target})`,
      occurredAt: p.paid_at ?? new Date(),
      stripeRef: p.stripe_payment_intent_id ?? null,
      partyUserId: p.user_id,
      lines: platformChargeLines({
        grossCents: p.amount_cents,
        taxCents: p.tax_cents ?? 0,
        target,
      }),
    });
  }

  /**
   * Stripe Tax told us the tax of a payment after it was booked: move it out
   * of revenue into tax_payable (the ledger is append-only, so this is a new
   * entry, once per payment).
   */
  async paymentTaxLearned(
    db: LedgerDb,
    paymentId: string,
    taxCents: number,
  ): Promise<void> {
    if (taxCents <= 0) return;
    const orig = await this.ledger.linesOf(db, {
      sourceType: 'payment',
      sourceId: paymentId,
      event: 'paid',
    });
    if (!orig) return;
    if (orig.lines.some((l) => l.account.code === 'tax_payable')) return;
    const revenue = orig.lines.find((l) => l.direction === 'credit');
    if (!revenue) return;
    const tax = Math.min(taxCents, revenue.cents);
    await this.ledger.post(db, {
      sourceType: 'payment',
      sourceId: paymentId,
      event: 'tax',
      currency: orig.currency,
      description: 'Tax split out of a payment',
      lines: [
        { account: revenue.account, direction: 'debit', cents: tax },
        { account: { code: 'tax_payable' }, direction: 'credit', cents: tax },
      ],
    });
  }

  /** Money back on a platform payment (admin refund). */
  async paymentRefunded(
    db: LedgerDb,
    input: {
      paymentId: string;
      /** Distinguishes several partial refunds of one payment. */
      refundId: string;
      cents: number;
      userId: string;
      sync?: boolean;
    },
  ): Promise<{ created: boolean }> {
    const orig = await this.ledger.linesOf(db, {
      sourceType: 'payment',
      sourceId: input.paymentId,
      event: 'paid',
    });
    if (!orig) return { created: false };
    return this.ledger.post(db, {
      sourceType: input.sync ? 'payment_refund_sync' : 'payment_refund',
      sourceId: `${input.paymentId}:${input.refundId}`,
      event: 'succeeded',
      currency: orig.currency,
      description: 'Refund of a payment',
      stripeRef: null,
      partyUserId: input.userId,
      lines: reverseProportional(orig.lines, input.cents, orig.grossCents),
    });
  }

  /** What was already refunded on a payment in the ledger (cents). */
  async refundedSoFar(db: LedgerDb, paymentId: string): Promise<number> {
    const entries = await db.ledgerEntry.findMany({
      where: {
        source_type: { in: PAYMENT_REFUND_TYPES },
        source_id: { startsWith: `${paymentId}:` },
      },
      select: {
        lines: {
          where: {
            direction: 'credit',
            account: { code: 'stripe_platform_balance' },
          },
          select: { amount_cents: true },
        },
      },
    });
    return entries.reduce(
      (s, e) => s + e.lines.reduce((x, l) => x + l.amount_cents, 0),
      0,
    );
  }

  /** The dashboard (or Stripe) refunded a payment: book what the ledger has not seen. */
  async paymentRefundSynced(
    db: LedgerDb,
    input: { paymentId: string; userId: string; totalRefundedCents: number },
  ): Promise<{ created: boolean }> {
    const already = await this.refundedSoFar(db, input.paymentId);
    const delta = input.totalRefundedCents - already;
    if (delta <= 0) return { created: false };
    return this.paymentRefunded(db, {
      paymentId: input.paymentId,
      refundId: `sync${input.totalRefundedCents}`,
      cents: delta,
      userId: input.userId,
      sync: true,
    });
  }

  /** A client's case payment succeeded (Stripe Connect). */
  casePaymentSucceeded(
    db: LedgerDb,
    p: CasePaymentFacts,
  ): Promise<{ created: boolean }> {
    return this.ledger.post(db, {
      sourceType: 'case_payment',
      sourceId: p.id,
      event: 'paid',
      currency: p.currency,
      description: 'Case payment received',
      occurredAt: p.paid_at ?? new Date(),
      stripeRef: p.stripe_charge_id ?? p.stripe_payment_intent_id ?? null,
      partyUserId: p.attorney_id,
      lines: casePaymentLines({
        attorneyId: p.attorney_id,
        clientTotalCents: p.client_total_cents,
        platformFeeCents: p.platform_fee_cents,
        attorneyNetCents: p.attorney_net_cents,
      }),
    });
  }

  /** Part (or all) of a case payment went back to the card. */
  casePaymentRefunded(
    db: LedgerDb,
    p: CasePaymentFacts,
    input: {
      /** The refund row id (idempotency). */
      refundId: string;
      cents: number;
      /** false for a lost chargeback: the fee stays with the platform. */
      refundApplicationFee: boolean;
    },
  ): Promise<{ created: boolean }> {
    return this.ledger.post(db, {
      sourceType: 'case_payment_refund',
      sourceId: input.refundId,
      event: 'succeeded',
      currency: p.currency,
      description: input.refundApplicationFee
        ? 'Case payment refunded'
        : 'Case payment lost in a chargeback',
      stripeRef: p.stripe_charge_id ?? null,
      partyUserId: p.attorney_id,
      lines: casePaymentRefundLines({
        attorneyId: p.attorney_id,
        refundCents: input.cents,
        clientTotalCents: p.client_total_cents,
        platformFeeCents: p.platform_fee_cents,
        refundApplicationFee: input.refundApplicationFee,
      }),
    });
  }

  /**
   * Stripe robustness 2026-10-27: a refund that was booked when it was
   * created (pending counts as money moving) failed afterwards, or a lost
   * chargeback was won late (funds reinstated): post the mirror image of the
   * earlier entry. Append-only, idempotent (one reversal per original), and a
   * no-op when the original was never booked.
   */
  async reverseCaseEntry(
    db: LedgerDb,
    input: {
      /** 'case_payment_refund' with the refund row id. */
      originalSourceType: 'case_payment_refund';
      originalSourceId: string;
      reason: 'refund_failed' | 'dispute_reinstated';
      partyUserId?: string | null;
      stripeRef?: string | null;
    },
  ): Promise<{ created: boolean }> {
    const orig = await this.ledger.linesOf(db, {
      sourceType: input.originalSourceType,
      sourceId: input.originalSourceId,
      event: 'succeeded',
    });
    if (!orig) return { created: false };
    return this.ledger.post(db, {
      sourceType: `${input.originalSourceType}_reversal`,
      sourceId: input.originalSourceId,
      event: input.reason,
      currency: orig.currency,
      description:
        input.reason === 'refund_failed'
          ? 'Refund failed at Stripe: money stays with the attorney'
          : 'Dispute won late: chargeback reversed',
      stripeRef: input.stripeRef ?? null,
      partyUserId: input.partyUserId ?? null,
      lines: orig.lines.map((l) => ({
        ...l,
        direction: l.direction === 'debit' ? 'credit' : 'debit',
      })),
    });
  }

  /** Cash the platform paid out for a cost (staff pay, partner commission). */
  expensePaid(
    db: LedgerDb,
    input: {
      sourceType: string;
      sourceId: string;
      expense: 'expense_payroll' | 'expense_partner_commission';
      cents: number;
      currency?: string;
      stripeRef?: string | null;
      partyUserId?: string | null;
      description: string;
    },
  ): Promise<{ created: boolean }> {
    return this.ledger.post(db, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      event: 'paid',
      currency: input.currency ?? 'usd',
      description: input.description,
      stripeRef: input.stripeRef ?? null,
      partyUserId: input.partyUserId ?? null,
      lines: expensePaidLines(input.expense, input.cents),
    });
  }

  /** Nightly sync: a Stripe fee / payout / unclassified movement, by balance transaction id. */
  stripeMovement(
    db: LedgerDb,
    input: {
      balanceTxnId: string;
      kind: 'fee' | 'payout' | 'other';
      /** Signed cents as Stripe reports them on the balance (fee < 0, payout < 0). */
      signedCents: number;
      currency: string;
      occurredAt: Date;
      description: string;
    },
  ): Promise<{ created: boolean }> {
    const abs = Math.abs(input.signedCents);
    let lines: Line[];
    if (input.kind === 'fee' && input.signedCents < 0) {
      lines = stripeFeeLines(abs);
    } else if (input.kind === 'payout' && input.signedCents < 0) {
      lines = bankPayoutLines(abs);
    } else {
      lines = suspenseLines(input.signedCents);
    }
    return this.ledger.post(db, {
      sourceType: 'stripe_balance_txn',
      sourceId: input.balanceTxnId,
      event: input.kind,
      currency: input.currency,
      description: input.description,
      occurredAt: input.occurredAt,
      stripeRef: input.balanceTxnId,
      lines,
    });
  }
}
