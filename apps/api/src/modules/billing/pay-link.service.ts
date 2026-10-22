import {
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { CheckoutRequestDto } from './billing.dto';

/** What a link pays for. */
export type PayKind = 'subscription' | 'seats' | 'promotion';

export interface PayPayload {
  /** The buyer. */
  u: string;
  /** What is bought (a token without it is a subscription: the format of
   * 2026-10-16). */
  k?: PayKind;
  /** subscription: the order (plan, seats, phones, promo code). */
  r?: CheckoutRequestDto;
  /** seats: the seat count wanted. */
  s?: number;
  /** promotion: the promotion's id. */
  p?: string;
  /** Expiry, unix seconds. */
  e: number;
  /** One-time id. */
  j?: string;
  /** 1 = the page's own token (handed out when the link was opened). */
  pg?: 1;
}

export type PayOrder =
  | { kind: 'subscription'; order: CheckoutRequestDto }
  | { kind: 'seats'; seats: number }
  | { kind: 'promotion'; promotionId: string };

export function payKindOf(p: PayPayload): PayKind {
  return p.k ?? 'subscription';
}

/**
 * Owner 2026-10-22 (audit #3): the signed links of our own card page
 * (`/pay.html`) for every purchase — the subscription, assistant seats and
 * Boost. The iPhone app has no payment screen at all (App Review 3.1.1 /
 * 3.1.1(a) US link-out): it opens this link in the browser and the page
 * signs the buyer in for that one purchase only.
 *
 * One-time: opening the link (`POST /pay/session` with the link token)
 * claims its id; the page then works with its own token (`pg`), which
 * pays for the same order only and expires with the link. A second open
 * of the same link is refused — the app makes a new one.
 */
@Injectable()
export class PayLinkService {
  private readonly key: Buffer;
  readonly webBase: string;

  constructor(
    private readonly cfg: ConfigService,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {
    // The 2026-10-16 derivation: links made before this change stay valid.
    this.key = createHmac('sha256', cfg.getOrThrow<string>('OTP_CODE_SECRET'))
      .update('pay-page:v1')
      .digest();
    this.webBase = (
      cfg.get<string>('WEB_APP_URL') ??
      cfg.get<string>('APP_LINK_BASE_URL') ??
      'https://lawbid.app'
    ).replace(/\/+$/, '');
  }

  /** The public Stripe key (admin card or the env). */
  async publishableKey(): Promise<string | null> {
    const saved = await this.secrets
      ?.field('stripe', 'publishableKey')
      .catch(() => undefined);
    return saved || this.cfg.get<string>('STRIPE_PUBLISHABLE_KEY') || null;
  }

  /** The page can be used: switched on, and the public key is known. */
  async enabled(): Promise<boolean> {
    if (this.settings) {
      const on = await this.settings.boolean('payments.own_page_enabled');
      if (!on) return false;
    }
    return (await this.publishableKey()) !== null;
  }

  private async ttlSeconds(): Promise<number> {
    const min = this.settings
      ? await this.settings.number('payments.own_page_ttl_minutes')
      : 30;
    return Math.max(1, min) * 60;
  }

  /** A one-time link to the card page for [order]. */
  async link(
    userId: string,
    order: PayOrder,
    apiBase: string,
  ): Promise<{ url: string; id: string; token: string }> {
    const payload: PayPayload = {
      u: userId,
      e: Math.floor(Date.now() / 1000) + (await this.ttlSeconds()),
      j: randomBytes(9).toString('base64url'),
      ...(order.kind === 'subscription'
        ? { r: order.order }
        : order.kind === 'seats'
          ? { k: 'seats' as const, s: order.seats }
          : { k: 'promotion' as const, p: order.promotionId }),
    };
    const token = this.sign(payload);
    const url = `${this.webBase}/pay.html#t=${token}&api=${encodeURIComponent(apiBase)}&ret=${encodeURIComponent(this.webBase)}`;
    return { url, id: token.slice(-12), token };
  }

  /**
   * Opening the page: a link token is claimed (once) and swapped for the
   * page's own token; a page token is accepted as it is.
   */
  async open(token: string): Promise<{ payload: PayPayload; page: string }> {
    const p = this.verify(token);
    if (p.pg === 1) return { payload: p, page: token };
    if (p.j && this.redis) {
      const ttl = Math.max(1, p.e - Math.floor(Date.now() / 1000));
      const first = await this.redis.set(
        `pay:link:${p.j}`,
        '1',
        'EX',
        ttl,
        'NX',
      );
      if (first !== 'OK') {
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHORIZED,
          message:
            'This payment link was already opened. Start the payment again from the app.',
        });
      }
    }
    const page: PayPayload = {
      ...p,
      j: randomBytes(9).toString('base64url'),
      pg: 1,
    };
    return { payload: p, page: this.sign(page) };
  }

  sign(p: PayPayload): string {
    const body = Buffer.from(JSON.stringify(p)).toString('base64url');
    const sig = createHmac('sha256', this.key).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  verify(token: string): PayPayload {
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
    let p: PayPayload;
    try {
      p = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as PayPayload;
    } catch {
      throw bad();
    }
    if (!p?.u || typeof p.e !== 'number' || p.e < Date.now() / 1000) {
      throw bad();
    }
    return p;
  }
}
