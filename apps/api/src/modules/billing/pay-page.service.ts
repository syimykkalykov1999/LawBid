import {
  BadRequestException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { CheckoutRequestDto, SubscriptionMeDto } from './billing.dto';
import {
  OWN_PAGE_SESSION_PREFIX,
  SubscriptionsService,
} from './subscriptions.service';

export interface PayPageSession {
  publishableKey: string;
  clientSecret: string;
  setupIntentId: string;
  priceCents: number;
  trialDays: number;
  trialEligible: boolean;
}

interface Payload {
  /** The attorney. */
  u: string;
  /** The order (plan, seats, phones, promo code). */
  r: CheckoutRequestDto;
  /** Expiry, unix seconds. */
  e: number;
}

/**
 * Owner 2026-10-16: our own card page (variant B) for the subscription. The
 * app opens a link to the static page; the link carries a short-lived signed
 * token (the attorney and the order), the page asks us for a SetupIntent,
 * Stripe.js saves the card, and we create the subscription from it — the same
 * `start` / `confirm` the in-app sheet uses. No store rules are touched: the
 * app only opens a link.
 */
@Injectable()
export class PayPageService {
  private readonly key: Buffer;
  private readonly webBase: string;

  constructor(
    config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly cfg?: ConfigService,
  ) {
    this.key = createHmac(
      'sha256',
      config.getOrThrow<string>('OTP_CODE_SECRET'),
    )
      .update('pay-page:v1')
      .digest();
    this.webBase = (
      config.get<string>('WEB_APP_URL') ??
      config.get<string>('APP_LINK_BASE_URL') ??
      'https://lawbid.app'
    ).replace(/\/+$/, '');
  }

  /** The public Stripe key (admin card or the env). */
  async publishableKey(): Promise<string | null> {
    const saved = await this.secrets
      ?.field('stripe', 'publishableKey')
      .catch(() => undefined);
    return saved || this.cfg?.get<string>('STRIPE_PUBLISHABLE_KEY') || null;
  }

  /** The page can be used: switched on, and the public key is known. */
  async enabled(): Promise<boolean> {
    if (this.settings) {
      const on = await this.settings.boolean('payments.own_page_enabled');
      if (!on) return false;
    }
    return (await this.publishableKey()) !== null;
  }

  async link(
    user: RequestUser,
    req: CheckoutRequestDto,
    apiBase: string,
  ): Promise<{ url: string; id: string }> {
    const ttlMin = this.settings
      ? await this.settings.number('payments.own_page_ttl_minutes')
      : 30;
    const token = this.sign({
      u: user.sub,
      r: req,
      e: Math.floor(Date.now() / 1000) + ttlMin * 60,
    });
    const url = `${this.webBase}/pay.html#t=${token}&api=${encodeURIComponent(apiBase)}&ret=${encodeURIComponent(this.webBase)}`;
    return { url, id: `${OWN_PAGE_SESSION_PREFIX}${token.slice(-12)}` };
  }

  async session(token: string): Promise<PayPageSession> {
    const p = this.verify(token);
    const key = await this.publishableKey();
    if (!key) {
      throw new BadRequestException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'The card page is not configured.',
      });
    }
    const started = await this.subscriptions.start(await this.userOf(p.u), p.r);
    return {
      publishableKey: key,
      clientSecret: started.clientSecret,
      setupIntentId: started.setupIntentId,
      priceCents: started.priceCents,
      trialDays: started.trialDays,
      trialEligible: started.trialEligible,
    };
  }

  async confirm(
    token: string,
    setupIntentId: string,
    chargeNow: boolean,
  ): Promise<SubscriptionMeDto> {
    const p = this.verify(token);
    return this.subscriptions.confirm(
      await this.userOf(p.u),
      setupIntentId,
      chargeNow,
    );
  }

  /** The attorney the token names, as a request user (no session: the card
   * page never gets an access token). */
  private async userOf(userId: string): Promise<RequestUser> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
    if (!u || u.role !== 'attorney' || u.status !== 'active') {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'This link is not valid.',
      });
    }
    return {
      sub: userId,
      role: 'attorney',
      sid: 'pay-page',
      verified: true,
      subscriptionStatus: 'none',
    };
  }

  private sign(p: Payload): string {
    const body = Buffer.from(JSON.stringify(p)).toString('base64url');
    const sig = createHmac('sha256', this.key).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private verify(token: string): Payload {
    const bad = () =>
      new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message:
          'This link is not valid or has expired. Open it again from the app.',
      });
    const [body, sig] = (token ?? '').split('.');
    if (!body || !sig) throw bad();
    const want = createHmac('sha256', this.key).update(body).digest();
    let got: Buffer;
    try {
      got = Buffer.from(sig, 'base64url');
    } catch {
      throw bad();
    }
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw bad();
    let p: Payload;
    try {
      p = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as Payload;
    } catch {
      throw bad();
    }
    if (!p?.u || typeof p.e !== 'number' || p.e < Date.now() / 1000)
      throw bad();
    return p;
  }
}
