import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';

export const PAYROLL_STRIPE_FLAG = 'payroll_stripe_payouts';

/** What the payroll needs from Stripe Connect (Express accounts). */
interface ConnectClient {
  createAccount(input: {
    employeeId: string;
    email: string | null;
  }): Promise<string>;
  onboardingUrl(accountId: string, returnUrl: string): Promise<string>;
  payoutsEnabled(accountId: string): Promise<boolean>;
  transfer(input: {
    accountId: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<string>;
  reverse(transferId: string, idempotencyKey: string): Promise<void>;
}

/**
 * Owner 2026-10-05: salaries can go out through Stripe Connect. Each
 * person gets a Stripe link (Express onboarding) and adds their bank
 * account or debit card there — LawBid never sees those details. With the
 * `payroll_stripe_payouts` flag on and Stripe keys saved, "Выплатить"
 * sends a transfer from the platform balance to their account; Stripe then
 * pays it out to the bank/card on its schedule. Without the flag or keys
 * every payment is recorded by hand, as before. Dev/test without keys use
 * an in-memory stand-in (never on a deployed server).
 */
@Injectable()
export class PayrollStripeService {
  private client: { fingerprint: string; c: ConnectClient } | null = null;

  constructor(
    private readonly secrets: SecretsService,
    private readonly flags: FeatureFlagsService,
    private readonly config: ConfigService,
  ) {}

  /** Flag on AND a Stripe key to use (or the dev stand-in). */
  async available(): Promise<boolean> {
    if (!(await this.flags.isEnabled(PAYROLL_STRIPE_FLAG, false))) {
      return false;
    }
    return (await this.connect(false)) !== null;
  }

  async createAccount(employeeId: string, email: string | null) {
    return (await this.require()).createAccount({ employeeId, email });
  }

  async onboardingUrl(accountId: string): Promise<string> {
    return (await this.require()).onboardingUrl(accountId, this.returnUrl());
  }

  async payoutsEnabled(accountId: string): Promise<boolean> {
    return (await this.require()).payoutsEnabled(accountId);
  }

  async transfer(input: Parameters<ConnectClient['transfer']>[0]) {
    return (await this.require()).transfer(input);
  }

  async reverse(transferId: string, idempotencyKey: string) {
    return (await this.require()).reverse(transferId, idempotencyKey);
  }

  private async require(): Promise<ConnectClient> {
    if (!(await this.flags.isEnabled(PAYROLL_STRIPE_FLAG, false))) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'Stripe payouts are off (flag payroll_stripe_payouts in Система → Флаги).',
      });
    }
    return (await this.connect(true))!;
  }

  private async connect(strict: boolean): Promise<ConnectClient | null> {
    const s = await this.secrets.get('stripe');
    const key = s?.fields.secretKey;
    if (s && key) {
      if (this.client?.fingerprint !== s.fingerprint) {
        this.client = { fingerprint: s.fingerprint, c: stripeClient(key) };
      }
      return this.client.c;
    }
    const env = this.config.get<string>('NODE_ENV');
    if (env === 'production' || env === 'staging') {
      if (!strict) return null;
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Save the Stripe keys in Система → Ключи и сервисы first.',
      });
    }
    if (this.client?.fingerprint !== 'fake') {
      this.client = { fingerprint: 'fake', c: fakeClient() };
    }
    return this.client.c;
  }

  private returnUrl(): string {
    const origin = (this.config.get<string>('ADMIN_ORIGINS') ?? '')
      .split(',')
      .map((o) => o.trim())
      .find((o) => o.startsWith('https://'));
    return `${origin ?? 'https://lawbid.dev'}/payroll`;
  }
}

function stripeClient(secretKey: string): ConnectClient {
  const stripe = new Stripe(secretKey, {
    typescript: true,
    maxNetworkRetries: 2,
  });
  return {
    async createAccount({ employeeId, email }) {
      const a = await stripe.accounts.create(
        {
          type: 'express',
          country: 'US',
          business_type: 'individual',
          ...(email ? { email } : {}),
          capabilities: { transfers: { requested: true } },
          metadata: { purpose: 'payroll', payroll_employee_id: employeeId },
        },
        { idempotencyKey: `payroll-account-${employeeId}` },
      );
      return a.id;
    },
    async onboardingUrl(accountId, returnUrl) {
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        refresh_url: returnUrl,
        return_url: returnUrl,
      });
      return link.url;
    },
    async payoutsEnabled(accountId) {
      const a = await stripe.accounts.retrieve(accountId);
      return a.payouts_enabled === true;
    },
    async transfer(input) {
      const t = await stripe.transfers.create(
        {
          amount: input.amountCents,
          currency: input.currency,
          destination: input.accountId,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return t.id;
    },
    async reverse(transferId, idempotencyKey) {
      await stripe.transfers.createReversal(transferId, {}, { idempotencyKey });
    },
  };
}

/** Dev/test stand-in: accounts are ready at once; an email containing
 * "fail" makes that person's transfers fail (for tests). */
function fakeClient(): ConnectClient {
  const failing = new Set<string>();
  return {
    createAccount({ email }) {
      const id = `acct_fake_${randomUUID().slice(0, 12)}`;
      if (email?.includes('fail')) failing.add(id);
      return Promise.resolve(id);
    },
    onboardingUrl(accountId) {
      return Promise.resolve(`https://connect.stripe.com/setup/e/${accountId}`);
    },
    payoutsEnabled() {
      return Promise.resolve(true);
    },
    transfer({ accountId }) {
      if (failing.has(accountId)) {
        return Promise.reject(new Error('Insufficient platform balance.'));
      }
      return Promise.resolve(`tr_fake_${randomUUID().slice(0, 12)}`);
    },
    reverse() {
      return Promise.resolve();
    },
  };
}
