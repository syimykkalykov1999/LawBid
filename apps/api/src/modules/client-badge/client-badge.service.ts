import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientVerification } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import { PricingService } from '../billing/pricing.service';
import type {
  PaymentProvider,
  ProviderCheckoutSession,
  ProviderSubscription,
} from '../billing/payment-provider';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  ClientBadgeCheckoutDto,
  ClientBadgeStateDto,
  ClientBadgeStatus,
  SubmitClientBadgeDto,
} from './client-badge.dto';
import { clientBadgeActive } from './client-badge.util';

export const CLIENT_BADGE_CHECKOUT_KIND = 'client_badge';
const CURRENCY = 'usd';

/**
 * Owner 2026-10-02 — the paid verified badge of a client (gold):
 * documents → approval in the admin → $10/month on Stripe. The badge is on
 * only while the approval stands AND the subscription is paid; a cancel,
 * a failed payment or a revoke turns it off (see clientBadgeActive).
 */
@Injectable()
export class ClientBadgeService {
  private readonly logger = new Logger(ClientBadgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: AppSettingsService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
    @Optional() private readonly pricing?: PricingService,
  ) {}

  // ---- the client's own state ------------------------------------------------

  async state(userId: string): Promise<ClientBadgeStateDto> {
    await this.requireClient(userId);
    let row = await this.prisma.clientVerification.findUnique({
      where: { user_id: userId },
    });
    // Back from the checkout page: pick up the payment without waiting
    // for the webhook.
    if (
      row &&
      row.status === 'approved' &&
      row.stripe_checkout_id &&
      !clientBadgeActive(row)
    ) {
      await this.applyCheckoutById(row.stripe_checkout_id);
      row = await this.prisma.clientVerification.findUnique({
        where: { user_id: userId },
      });
    }
    return this.toState(row);
  }

  async submit(
    userId: string,
    dto: SubmitClientBadgeDto,
  ): Promise<ClientBadgeStateDto> {
    await this.requireClient(userId);
    const fileIds = [...new Set(dto.fileIds)];
    for (const id of fileIds) {
      await this.files.assertAttachable(userId, id, [
        'verification_document',
        'verification_selfie',
      ]);
    }
    const existing = await this.prisma.clientVerification.findUnique({
      where: { user_id: userId },
    });
    if (
      existing &&
      (existing.status === 'pending' || existing.status === 'approved')
    ) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message:
          existing.status === 'pending'
            ? 'Your request is already under review.'
            : 'Your account is already approved.',
        details: { status: existing.status },
      });
    }
    const data = {
      status: 'pending',
      document_file_ids: fileIds,
      note: dto.note ?? null,
      submitted_at: new Date(),
      reviewed_at: null,
      reviewed_by: null,
      reject_reason: null,
      revoke_reason: null,
    };
    const row = await this.prisma.clientVerification.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: data,
    });
    return this.toState(row);
  }

  /** Approved and not paid → Stripe checkout for the $10/month. */
  async checkout(userId: string): Promise<ClientBadgeCheckoutDto> {
    const user = await this.requireClient(userId);
    const row = await this.prisma.clientVerification.findUnique({
      where: { user_id: userId },
    });
    if (!row || row.status !== 'approved') {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: 'Your account is not approved yet.',
        details: { status: row?.status ?? 'none' },
      });
    }
    if (clientBadgeActive(row)) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: 'The badge is already active.',
      });
    }
    const provider = this.provider;
    // Owner 2026-10-03: the price set in the admin (Billing → Prices).
    const priceId = this.pricing
      ? await this.pricing.priceId('client_badge')
      : (this.config.get<string>('STRIPE_PRICE_VERIFIED_ID') ??
        (provider?.name === 'fake' ? 'price_fake_badge' : undefined));
    if (!provider || !priceId) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are not configured on this server.',
      });
    }
    const customerId = await this.customerId(userId, user.email);
    const base = (
      this.config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app'
    ).replace(/\/+$/, '');
    const session = await provider.createCheckoutSession({
      customerId,
      lineItems: [{ priceId, quantity: 1 }],
      trialDays: null,
      successUrl: `${base}/verification/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/verification/cancel`,
      metadata: {
        kind: CLIENT_BADGE_CHECKOUT_KIND,
        userId,
        verificationId: row.id,
      },
    });
    await this.prisma.clientVerification.update({
      where: { id: row.id },
      data: { stripe_checkout_id: session.id },
    });
    if (!session.url) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'The checkout page is not available.',
      });
    }
    return { checkoutUrl: session.url };
  }

  /** Stop renewing: the badge stays until the paid period ends. */
  async setCancel(
    userId: string,
    cancel: boolean,
  ): Promise<ClientBadgeStateDto> {
    await this.requireClient(userId);
    const row = await this.prisma.clientVerification.findUnique({
      where: { user_id: userId },
    });
    if (!row || !row.stripe_subscription_id || !this.provider) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: 'There is no subscription to change.',
      });
    }
    const remote = await this.provider.setCancelAtPeriodEnd(
      row.stripe_subscription_id,
      cancel,
    );
    await this.applySubscription(remote);
    return this.state(userId);
  }

  // ---- payment events (Stripe webhook / the app's state read) ----------------

  async applyCheckoutById(sessionId: string): Promise<boolean> {
    try {
      const session = this.provider
        ? await this.provider.retrieveCheckoutSession(sessionId)
        : null;
      return session ? await this.applyCheckout(session) : false;
    } catch (e) {
      this.logger.warn(
        { sessionId, err: String(e) },
        'client badge checkout check failed',
      );
      return false;
    }
  }

  async applyCheckout(session: ProviderCheckoutSession): Promise<boolean> {
    if (session.metadata.kind !== CLIENT_BADGE_CHECKOUT_KIND) return false;
    if (session.status !== 'complete' || !session.subscriptionId) return false;
    const remote = await this.provider?.retrieveSubscription(
      session.subscriptionId,
    );
    if (!remote) return false;
    const userId = session.metadata.userId;
    const row = userId
      ? await this.prisma.clientVerification.findUnique({
          where: { user_id: userId },
        })
      : null;
    if (!row || row.stripe_checkout_id !== session.id) return false;
    await this.prisma.clientVerification.update({
      where: { id: row.id },
      data: { stripe_subscription_id: remote.id },
    });
    await this.applySubscription(remote);
    return true;
  }

  /** A subscription event of the provider: true when it belongs to a
   * client's badge (the attorney subscription sync then skips it). */
  async onSubscriptionEvent(subscriptionId: string): Promise<boolean> {
    const row = await this.prisma.clientVerification.findUnique({
      where: { stripe_subscription_id: subscriptionId },
    });
    if (!row) return false;
    const remote = await this.provider?.retrieveSubscription(subscriptionId);
    if (remote) await this.applySubscription(remote);
    return true;
  }

  async applySubscription(remote: ProviderSubscription): Promise<void> {
    const row = await this.prisma.clientVerification.findUnique({
      where: { stripe_subscription_id: remote.id },
    });
    if (!row) return;
    const before = clientBadgeActive(row);
    const sub =
      remote.status === 'active' || remote.status === 'trialing'
        ? 'active'
        : remote.status === 'past_due' || remote.status === 'unpaid'
          ? 'past_due'
          : remote.status === 'canceled' ||
              remote.status === 'incomplete_expired'
            ? 'canceled'
            : 'none';
    const periodEnd = remote.currentPeriodEnd
      ? new Date(remote.currentPeriodEnd * 1000)
      : row.current_period_end;
    const updated = await this.prisma.clientVerification.update({
      where: { id: row.id },
      data: {
        sub_status: sub,
        current_period_end: periodEnd,
        cancel_at_period_end: remote.cancelAtPeriodEnd,
      },
    });
    const after = clientBadgeActive(updated);
    if (before !== after) await this.notifyBadge(updated, after);
  }

  // ---- helpers ------------------------------------------------------------------

  async notifyBadge(row: ClientVerification, on: boolean): Promise<void> {
    await this.notifications
      .emit({
        type: 'verification_update',
        recipientId: row.user_id,
        payload: {
          kind: 'client_badge',
          status: on ? 'badge_on' : row.status,
        },
      })
      .catch(() => undefined);
  }

  async priceCents(): Promise<number> {
    if (this.pricing) return this.pricing.amount('client_badge');
    return this.settings.number('verification.client_badge_cents');
  }

  private async toState(
    row: ClientVerification | null,
  ): Promise<ClientBadgeStateDto> {
    const status = (row?.status ?? 'none') as ClientBadgeStatus;
    const active = clientBadgeActive(row);
    return {
      status,
      badgeActive: active,
      priceCents: await this.priceCents(),
      currency: CURRENCY,
      canSubmit:
        status === 'none' || status === 'rejected' || status === 'revoked',
      canSubscribe: status === 'approved' && !active,
      subscription:
        row && row.sub_status !== 'none'
          ? {
              status: row.sub_status,
              currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
              cancelAtPeriodEnd: row.cancel_at_period_end,
            }
          : null,
      submittedAt: row?.submitted_at.toISOString() ?? null,
      rejectReason: row?.reject_reason ?? null,
      revokeReason: row?.revoke_reason ?? null,
    };
  }

  private async requireClient(
    userId: string,
  ): Promise<{ email: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });
    if (!user) throw new NotFoundException();
    if (user.role !== 'client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'The gold badge is for client accounts.',
      });
    }
    return { email: user.email };
  }

  private async customerId(
    userId: string,
    email: string | null,
  ): Promise<string> {
    const existing = await this.prisma.stripeCustomer.findUnique({
      where: { user_id: userId },
    });
    if (existing) return existing.stripe_customer_id;
    const id = await this.provider!.createCustomer({ userId, email });
    const row = await this.prisma.stripeCustomer.upsert({
      where: { user_id: userId },
      create: { user_id: userId, stripe_customer_id: id },
      update: {},
    });
    return row.stripe_customer_id;
  }
}
