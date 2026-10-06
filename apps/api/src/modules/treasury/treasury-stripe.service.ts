import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { SecretsService } from '../../common/secrets/secrets.service';

/** A bank account (or debit card) the owner added in Stripe. */
export interface StripeBank {
  id: string;
  label: string;
  last4: string;
  /** Stripe's default for USD payouts (the «основной» one). */
  isDefault: boolean;
}

export interface StripeTreasuryState {
  availableCents: number;
  pendingCents: number;
  /** Stripe's payout schedule: `manual` is what the monthly split needs. */
  payoutInterval: string | null;
  /** null = Stripe did not list the banks (the default one is still used). */
  banks: StripeBank[] | null;
}

export type StripePayoutStatus =
  'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';

/** What the monthly split needs from the platform's own Stripe account. */
interface TreasuryClient {
  state(): Promise<StripeTreasuryState>;
  payout(input: {
    amountCents: number;
    /** Bank id from `banks`; undefined = Stripe's default. */
    destination?: string;
    description: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; status: StripePayoutStatus }>;
  payoutStatus(
    id: string,
  ): Promise<{ status: StripePayoutStatus; failure: string | null }>;
}

/**
 * Owner 2026-10-05 «Прибыль и резерв»: the platform's own Stripe account —
 * its balance, its payout schedule, the banks the owner added in Stripe,
 * and payouts to those banks. There is deliberately no way to add or pick
 * a bank from LawBid: money can only go to a bank that is already in
 * Stripe (adding one there needs the owner's Stripe login and 2FA), so a
 * stolen admin password can't redirect a cent. Dev/test without keys use
 * an in-memory stand-in (never on a deployed server).
 */
@Injectable()
export class TreasuryStripeService {
  private client: { fingerprint: string; c: TreasuryClient } | null = null;

  constructor(
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
  ) {}

  /** null = no Stripe key on a deployed server (nothing to do yet). */
  async state(): Promise<StripeTreasuryState | null> {
    const c = await this.connect();
    return c ? c.state() : null;
  }

  async payout(input: Parameters<TreasuryClient['payout']>[0]) {
    return (await this.require()).payout(input);
  }

  async payoutStatus(id: string) {
    return (await this.require()).payoutStatus(id);
  }

  private async require(): Promise<TreasuryClient> {
    const c = await this.connect();
    if (!c) throw new Error('Stripe keys are not saved.');
    return c;
  }

  private async connect(): Promise<TreasuryClient | null> {
    const s = await this.secrets.get('stripe');
    const key = s?.fields.secretKey;
    if (s && key) {
      if (this.client?.fingerprint !== s.fingerprint) {
        this.client = { fingerprint: s.fingerprint, c: stripeClient(key) };
      }
      return this.client.c;
    }
    const env = this.config.get<string>('NODE_ENV');
    if (env === 'production' || env === 'staging') return null;
    if (this.client?.fingerprint !== 'fake') {
      this.client = { fingerprint: 'fake', c: fakeClient() };
    }
    return this.client.c;
  }
}

/** A short fingerprint of the bank list (an alert when it changes). */
export function banksFingerprint(banks: StripeBank[]): string {
  const ids = banks
    .map((b) => `${b.id}${b.isDefault ? '*' : ''}`)
    .sort()
    .join(',');
  return createHash('sha256').update(ids).digest('hex').slice(0, 16);
}

function usd(list: { amount: number; currency: string }[]): number {
  return list
    .filter((b) => b.currency === 'usd')
    .reduce((s, b) => s + b.amount, 0);
}

function bankOf(x: Stripe.ExternalAccount): StripeBank {
  if (x.object === 'bank_account') {
    return {
      id: x.id,
      label: x.bank_name ?? 'Bank',
      last4: x.last4,
      isDefault: x.default_for_currency === true,
    };
  }
  return {
    id: x.id,
    label: x.brand ?? 'Card',
    last4: x.last4,
    isDefault: x.default_for_currency === true,
  };
}

function stripeClient(secretKey: string): TreasuryClient {
  const stripe = new Stripe(secretKey, {
    typescript: true,
    maxNetworkRetries: 2,
  });
  return {
    async state() {
      const [balance, account] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.accounts.retrieveCurrent(),
      ]);
      let banks: StripeBank[] | null = null;
      const listed = account.external_accounts?.data;
      if (listed) {
        banks = listed.map(bankOf);
      } else {
        try {
          const page = await stripe.accounts.listExternalAccounts(account.id, {
            limit: 20,
          });
          banks = page.data.map(bankOf);
        } catch {
          banks = null; // payouts still go to Stripe's default bank
        }
      }
      return {
        availableCents: usd(balance.available),
        pendingCents: usd(balance.pending),
        payoutInterval: account.settings?.payouts?.schedule?.interval ?? null,
        banks,
      };
    },
    async payout(input) {
      const p = await stripe.payouts.create(
        {
          amount: input.amountCents,
          currency: 'usd',
          ...(input.destination ? { destination: input.destination } : {}),
          description: input.description,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { id: p.id, status: p.status as StripePayoutStatus };
    },
    async payoutStatus(id) {
      const p = await stripe.payouts.retrieve(id);
      return {
        status: p.status as StripePayoutStatus,
        failure: p.failure_message ?? p.failure_code ?? null,
      };
    },
  };
}

/** Dev/test stand-in: $5,000 on the balance, two banks, manual payouts;
 * payouts are paid at once and come off the balance. */
function fakeClient(): TreasuryClient {
  let available = 500_000;
  const paid = new Set<string>();
  return {
    state() {
      return Promise.resolve({
        availableCents: available,
        pendingCents: 12_500,
        payoutInterval: 'manual',
        banks: [
          {
            id: 'ba_fake_profit',
            label: 'Chase',
            last4: '6789',
            isDefault: true,
          },
          {
            id: 'ba_fake_costs',
            label: 'Mercury',
            last4: '4321',
            isDefault: false,
          },
        ],
      });
    },
    payout({ amountCents, idempotencyKey }) {
      if (!paid.has(idempotencyKey)) {
        if (amountCents > available) {
          return Promise.reject(new Error('Insufficient funds in Stripe.'));
        }
        available -= amountCents;
        paid.add(idempotencyKey);
      }
      return Promise.resolve({
        id: `po_fake_${randomUUID().slice(0, 12)}`,
        status: 'paid' as const,
      });
    },
    payoutStatus() {
      return Promise.resolve({ status: 'paid' as const, failure: null });
    },
  };
}
