import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { resilientStripeOptions } from '../../common/resilience/stripe-breaker';
import { SecretsService } from '../../common/secrets/secrets.service';

/** One row of Stripe's balance history (the platform account). */
export interface StripeBalanceTxn {
  id: string;
  /** charge, payment, refund, payment_refund, application_fee, stripe_fee, payout, transfer, adjustment ... */
  type: string;
  /** Gross, signed, in cents. */
  amount: number;
  /** Stripe's fee on this row (positive cents). */
  fee: number;
  currency: string;
  created: Date;
  description: string | null;
  /** The Stripe object behind the row (ch_, tr_, po_ ...). */
  source: string | null;
}

/**
 * Read-only Stripe access for the nightly ledger reconciliation: the
 * platform account's balance transactions. null / [] when no key is saved
 * (dev and test never call Stripe from here).
 */
@Injectable()
export class LedgerStripeService {
  private client: { fingerprint: string; s: Stripe } | null = null;

  constructor(private readonly secrets: SecretsService) {}

  private async stripe(): Promise<Stripe | null> {
    const s = await this.secrets.get('stripe');
    const key = s?.fields.secretKey;
    if (!s || !key) return null;
    if (this.client?.fingerprint !== s.fingerprint) {
      this.client = {
        fingerprint: s.fingerprint,
        s: new Stripe(key, resilientStripeOptions()),
      };
    }
    return this.client.s;
  }

  /** false = no Stripe key (the Stripe part of the reconciliation is skipped). */
  async available(): Promise<boolean> {
    return (await this.stripe()) !== null;
  }

  /** Balance transactions created in [from, to), oldest first. */
  async balanceTransactions(from: Date, to: Date): Promise<StripeBalanceTxn[]> {
    const stripe = await this.stripe();
    if (!stripe) return [];
    const out: StripeBalanceTxn[] = [];
    const list = stripe.balanceTransactions.list({
      created: {
        gte: Math.floor(from.getTime() / 1000),
        lt: Math.floor(to.getTime() / 1000),
      },
      limit: 100,
    });
    for await (const t of list) {
      out.push({
        id: t.id,
        type: t.type,
        amount: t.amount,
        fee: t.fee,
        currency: t.currency,
        created: new Date(t.created * 1000),
        description: t.description ?? null,
        source:
          typeof t.source === 'string' ? t.source : (t.source?.id ?? null),
      });
    }
    return out.sort((a, b) => a.created.getTime() - b.created.getTime());
  }
}
