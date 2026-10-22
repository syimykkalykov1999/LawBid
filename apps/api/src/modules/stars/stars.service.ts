import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Gift, type GiftSend } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import {
  checkoutOf,
  oneTimePayPageSession,
  type OneTimePaySession,
} from '../billing/one-time-pay-page';
import { PayLinkService } from '../billing/pay-link.service';
import type {
  PaymentProvider,
  ProviderCheckoutSession,
} from '../billing/payment-provider';
import { BlocksService } from '../blocks/blocks.service';
import { FilesService } from '../files/files.service';
import { PrivacySettingsService } from '../privacy-settings/privacy-settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminGiftDto,
  ConvertGiftResultDto,
  CreateGiftDto,
  GiftDto,
  GiftSendDto,
  SaveStarsSettingsDto,
  SendProfileGiftDto,
  StarLedgerItemDto,
  StarsDebtDto,
  StarsKindTotalDto,
  StarsAdminSettingsDto,
  StarsOverviewDto,
  StarsPurchaseDto,
  StarsReportDto,
  UpdateGiftDto,
} from './stars.dto';
import {
  assertUniquePackIds,
  convertedStars,
  FREE_REACTIONS,
  parsePremiumReactions,
  starsForCents,
  parseStarsConfig,
  STARS_CHECKOUT_KIND,
  STARS_FLAG,
  STARS_SETTINGS_KEY,
  type StarPack,
} from './stars.settings';

/** Lists leave the interceptor as `data: items` + `meta.nextCursor`. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

type Tx = Prisma.TransactionClient;
type Db = PrismaService | Tx;

const PAGE = 30;
const SHOWCASE_PAGE = 40;

const featureOff = () =>
  new ConflictException({
    code: ErrorCode.FEATURE_DISABLED,
    message: 'Stars are not available right now.',
  });

const notEnough = (need: number, have: number) =>
  new HttpException(
    {
      code: ErrorCode.INSUFFICIENT_STARS,
      message: 'Not enough stars.',
      details: { need, have },
    },
    HttpStatus.PAYMENT_REQUIRED,
  );

const notFound = (what: string) =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });

/**
 * Owner 2026-10-20 — stars, like Telegram Stars: an in-app balance bought
 * ONLY on the web (hosted Stripe checkout, 3-D Secure), so the stores take
 * nothing. Spent on gifts (in a chat or on a profile) and on paid sticker
 * packs. Every change of a balance is one ledger row with a unique key: a
 * retried webhook or a double tap is a no-op, and the balance cannot go
 * below zero (a conditional UPDATE + a CHECK).
 */
@Injectable()
export class StarsService {
  private readonly logger = new Logger(StarsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly files: FilesService,
    private readonly blocks: BlocksService,
    private readonly notifications: NotificationsService,
    // Owner 2026-10-20: a profile gift obeys «who can write to me».
    @Optional() private readonly privacy?: PrivacySettingsService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
    // Owner 2026-10-22: our own card page in place of Stripe's.
    @Optional() private readonly payLink?: PayLinkService,
  ) {}

  // ── switch, packs, settings ───────────────────────────────────────────

  async enabled(): Promise<boolean> {
    const f = await this.prisma.featureFlag.findUnique({
      where: { key: STARS_FLAG },
      select: { enabled: true },
    });
    return f?.enabled ?? false;
  }

  async assertEnabled(): Promise<void> {
    if (!(await this.enabled())) throw featureOff();
  }

  private async cfg() {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: STARS_SETTINGS_KEY },
    });
    return parseStarsConfig(row?.value);
  }

  /** US cents one star is worth for a Boost paid in stars. */
  async starCents(): Promise<number> {
    return (await this.cfg()).starCents;
  }

  async packs(): Promise<StarPack[]> {
    return (await this.cfg()).packs;
  }

  async adminSettings(): Promise<StarsAdminSettingsDto> {
    const c = await this.cfg();
    return {
      packs: c.packs,
      enabled: await this.enabled(),
      giftConvertPercent: c.giftConvertPercent,
      giftsPerDayMax: c.giftsPerDayMax,
      starCents: c.starCents,
      reactionStars: c.reactionStars,
      premiumReactions: c.premiumReactions,
    };
  }

  async saveSettings(
    dto: SaveStarsSettingsDto,
  ): Promise<StarsAdminSettingsDto> {
    assertUniquePackIds(dto.packs);
    const cur = await this.cfg();
    const value = {
      packs: dto.packs,
      giftConvertPercent: dto.giftConvertPercent,
      giftsPerDayMax: dto.giftsPerDayMax,
      starCents: dto.starCents ?? cur.starCents,
      reactionStars: dto.reactionStars ?? cur.reactionStars,
      premiumReactions: dto.premiumReactions
        ? parsePremiumReactions(dto.premiumReactions)
        : cur.premiumReactions,
    } as object;
    await this.prisma.appConfig.upsert({
      where: { key: STARS_SETTINGS_KEY },
      create: { key: STARS_SETTINGS_KEY, value },
      update: { value },
    });
    return this.adminSettings();
  }

  // ── balance ───────────────────────────────────────────────────────────

  async balance(userId: string, db: Db = this.prisma): Promise<number> {
    const row = await db.starWallet.findUnique({ where: { user_id: userId } });
    return row?.balance ?? 0;
  }

  /** GET /stars */
  async overview(userId: string): Promise<StarsOverviewDto> {
    const enabled = await this.enabled();
    return {
      enabled,
      balance: await this.balance(userId),
      packs: enabled ? await this.packs() : [],
      giftConvertPercent: (await this.cfg()).giftConvertPercent,
      starCents: (await this.cfg()).starCents,
      reactionStars: (await this.cfg()).reactionStars,
      premiumReactions: (await this.cfg()).premiumReactions,
      freeReactions: [...FREE_REACTIONS],
    };
  }

  /** The price of [cents] in stars, or null while stars are off / free. */
  async starsForCents(cents: number): Promise<number | null> {
    if (cents <= 0 || !(await this.enabled())) return null;
    return starsForCents(cents, (await this.cfg()).starCents);
  }

  /**
   * Adds stars. Returns false (and changes nothing) when [idemKey] was
   * already applied — a retried webhook / request.
   */
  async credit(
    tx: Tx,
    userId: string,
    amount: number,
    kind: string,
    idemKey: string,
    opts: { refId?: string; note?: string; bought?: boolean } = {},
  ): Promise<boolean> {
    const ins = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO star_ledger (user_id, delta, balance_after, kind, ref_id, note, idem_key)
      VALUES (${userId}::uuid, ${amount}, 0, ${kind}, ${opts.refId ?? null}::uuid,
              ${opts.note ?? null}, ${idemKey})
      ON CONFLICT (idem_key) DO NOTHING
      RETURNING id`;
    if (ins.length === 0) return false;
    const bought = opts.bought ? amount : 0;
    const [w] = await tx.$queryRaw<{ balance: number }[]>`
      INSERT INTO star_wallets (user_id, balance, lifetime_bought)
      VALUES (${userId}::uuid, ${amount}, ${bought})
      ON CONFLICT (user_id) DO UPDATE
        SET balance = star_wallets.balance + ${amount}::int
                      - LEAST(star_wallets.debt, ${amount}::int),
            debt = star_wallets.debt - LEAST(star_wallets.debt, ${amount}::int),
            lifetime_bought = star_wallets.lifetime_bought + ${bought},
            updated_at = now()
      RETURNING balance`;
    await tx.$executeRaw`
      UPDATE star_ledger SET balance_after = ${w.balance}
      WHERE id = ${ins[0].id}::uuid`;
    return true;
  }

  /**
   * Takes stars (402 INSUFFICIENT_STARS when there are not enough; the
   * caller's transaction then rolls back everything). Returns false when
   * [idemKey] was already applied — nothing is charged twice.
   */
  async debit(
    tx: Tx,
    userId: string,
    amount: number,
    kind: string,
    idemKey: string,
    opts: { refId?: string; note?: string } = {},
  ): Promise<boolean> {
    const ins = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO star_ledger (user_id, delta, balance_after, kind, ref_id, note, idem_key)
      VALUES (${userId}::uuid, ${-amount}, 0, ${kind}, ${opts.refId ?? null}::uuid,
              ${opts.note ?? null}, ${idemKey})
      ON CONFLICT (idem_key) DO NOTHING
      RETURNING id`;
    if (ins.length === 0) return false;
    const upd = await tx.$queryRaw<{ balance: number }[]>`
      UPDATE star_wallets
      SET balance = balance - ${amount},
          lifetime_spent = lifetime_spent + ${amount},
          updated_at = now()
      WHERE user_id = ${userId}::uuid AND balance >= ${amount}
      RETURNING balance`;
    if (upd.length === 0)
      throw notEnough(amount, await this.balance(userId, tx));
    await tx.$executeRaw`
      UPDATE star_ledger SET balance_after = ${upd[0].balance}
      WHERE id = ${ins[0].id}::uuid`;
    return true;
  }

  /**
   * A premium reaction costs [reactionStars] once per user, message and
   * emoji (the chat's reaction endpoint calls this inside its own
   * transaction, so a failed save never keeps the charge). Returns the
   * stars taken — 0 for a free emoji or one already paid for.
   */
  async chargeReaction(
    tx: Tx,
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<number> {
    const cfg = await this.cfg();
    if (!cfg.premiumReactions.includes(emoji)) return 0;
    if (!(await this.enabled())) throw featureOff();
    const ok = await this.debit(
      tx,
      userId,
      cfg.reactionStars,
      'reaction',
      `reaction:${messageId}:${userId}:${emoji}`,
      { refId: messageId },
    );
    return ok ? cfg.reactionStars : 0;
  }

  /** GET /stars/history */
  async history(
    userId: string,
    cursor?: string,
  ): Promise<Page<StarLedgerItemDto>> {
    return this.ledgerPage({ user_id: userId }, cursor);
  }

  async ledgerPage(
    where: Prisma.StarLedgerWhereInput,
    cursor?: string,
  ): Promise<Page<StarLedgerItemDto>> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.starLedger.findMany({
      where: {
        ...where,
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: page.map((r): StarLedgerItemDto => ({
        id: r.id,
        delta: r.delta,
        balanceAfter: r.balance_after,
        kind: r.kind,
        note: r.note,
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  // ── buying stars (hosted Stripe page, web only) ───────────────────────

  /** POST /stars/packs/:packId/buy → the hosted payment page. */
  async buy(
    userId: string,
    packId: string,
    apiBase?: string,
  ): Promise<{ purchaseId: string; checkoutUrl: string }> {
    await this.assertEnabled();
    const pack = (await this.packs()).find((p) => p.id === packId);
    if (!pack) throw notFound('Pack');
    if (!this.provider?.createOneTimeCheckout) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are not configured on this server.',
      });
    }
    const row = await this.prisma.starPurchase.create({
      data: {
        user_id: userId,
        pack_id: pack.id,
        stars: pack.stars,
        price_cents: pack.priceCents,
      },
    });
    // Owner 2026-10-22: our own card page (card, Apple Pay, Google Pay);
    // on the iPhone it opens in Safari — the stars are never bought inside
    // the iOS app, only spent there. Stripe's page stays the fallback.
    if (apiBase && this.payLink && (await this.payLink.enabled())) {
      const link = await this.payLink.link(
        userId,
        { kind: 'stars', purchaseId: row.id },
        apiBase,
      );
      return { purchaseId: row.id, checkoutUrl: link.url };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const base = (
      this.config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app'
    ).replace(/\/+$/, '');
    try {
      const session = await this.provider.createOneTimeCheckout({
        customerEmail: user?.email ?? null,
        amountCents: pack.priceCents,
        description: `LawBid — ${pack.stars} stars`,
        metadata: {
          kind: STARS_CHECKOUT_KIND,
          purchaseId: row.id,
          userId,
        },
        successUrl: `${base}/stars/success?purchase_id=${row.id}`,
        cancelUrl: `${base}/stars/cancel?purchase_id=${row.id}`,
        idempotencyKey: `stars:${row.id}`,
      });
      if (!session.url) {
        throw new ServiceUnavailableException({
          code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
          message: 'The checkout page is not available.',
        });
      }
      await this.prisma.starPurchase.update({
        where: { id: row.id },
        data: { stripe_checkout_id: session.id },
      });
      return { purchaseId: row.id, checkoutUrl: session.url };
    } catch (e) {
      await this.prisma.starPurchase.update({
        where: { id: row.id },
        data: { status: 'canceled' },
      });
      throw e;
    }
  }

  /** GET /stars/purchases/:id — the app's return; also asks the provider
   * in case the webhook is late. */
  async purchase(userId: string, id: string): Promise<StarsPurchaseDto> {
    const row = await this.prisma.starPurchase.findFirst({
      where: { id, user_id: userId },
    });
    if (!row) throw notFound('Purchase');
    if (row.status === 'pending_payment' && row.stripe_checkout_id) {
      await this.applyCheckoutById(row.stripe_checkout_id);
    }
    const fresh = await this.prisma.starPurchase.findUniqueOrThrow({
      where: { id },
    });
    return {
      status: fresh.status,
      stars: fresh.stars,
      balance: await this.balance(userId),
    };
  }

  /** Cron `stars.sweep`: top-ups paid more than 2 minutes ago whose webhook
   * never arrived (or lost the race with the session id) are credited. */
  async sweepPending(): Promise<void> {
    const rows = await this.prisma.starPurchase.findMany({
      where: {
        status: 'pending_payment',
        stripe_checkout_id: { not: null },
        created_at: {
          lt: new Date(Date.now() - 2 * 60 * 1000),
          gt: new Date(Date.now() - 24 * 3600 * 1000),
        },
      },
      select: { stripe_checkout_id: true },
      take: 100,
    });
    for (const r of rows) {
      if (r.stripe_checkout_id)
        await this.applyCheckoutById(r.stripe_checkout_id);
    }
  }

  /** Owner 2026-10-22: the card page opened for a top-up — its PaymentIntent. */
  async payPageSession(
    userId: string,
    id: string,
  ): Promise<OneTimePaySession & { stars: number }> {
    const row = await this.prisma.starPurchase.findUnique({ where: { id } });
    const s = await oneTimePayPageSession({
      provider: this.provider,
      row,
      userId,
      kind: STARS_CHECKOUT_KIND,
      description: `LawBid — ${row?.stars ?? 0} stars`,
      save: async (pi) => {
        await this.prisma.starPurchase.update({
          where: { id },
          data: { stripe_checkout_id: pi },
        });
      },
      apply: (session) => this.applyCheckout(session),
    });
    return { ...s, stars: row?.stars ?? 0 };
  }

  /** The card page says it paid: check its PaymentIntent and credit. */
  async payPageConfirm(userId: string, id: string): Promise<boolean> {
    const row = await this.prisma.starPurchase.findUnique({ where: { id } });
    if (!row || row.user_id !== userId) return false;
    if (row.status === 'paid') return true;
    return row.stripe_checkout_id
      ? this.applyCheckoutById(row.stripe_checkout_id)
      : false;
  }

  async applyCheckoutById(sessionId: string): Promise<boolean> {
    try {
      const s = await checkoutOf(this.provider, sessionId);
      return s ? await this.applyCheckout(s) : false;
    } catch (e) {
      this.logger.warn({ sessionId, err: String(e) }, 'stars check failed');
      return false;
    }
  }

  /**
   * Stripe `charge.refunded`: the refunded top-ups take their stars back.
   * The balance never goes below 0 — what was already spent becomes a debt
   * the next credits pay off first (shown in the admin). Idempotent per
   * purchase.
   */
  async refundPayments(paymentIds: string[]): Promise<number> {
    if (paymentIds.length === 0) return 0;
    const rows = await this.prisma.starPurchase.findMany({
      where: {
        payment_id: { in: paymentIds },
        status: 'paid',
        refunded_at: null,
      },
    });
    let n = 0;
    for (const p of rows) {
      const done = await withTxRetry(this.prisma, async (tx) => {
        const mark = await tx.starPurchase.updateMany({
          where: { id: p.id, refunded_at: null },
          data: { refunded_at: new Date() },
        });
        if (mark.count === 0) return false;
        const [w] = await tx.$queryRaw<{ balance: number }[]>`
          SELECT balance FROM star_wallets
          WHERE user_id = ${p.user_id}::uuid FOR UPDATE`;
        const take = Math.min(w?.balance ?? 0, p.stars);
        const owed = p.stars - take;
        const ins = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO star_ledger (user_id, delta, balance_after, kind, ref_id, note, idem_key)
          VALUES (${p.user_id}::uuid, ${-take}, 0, 'refund', ${p.id}::uuid,
                  ${owed > 0 ? `debt ${owed}` : null}, ${`refund:${p.id}`})
          ON CONFLICT (idem_key) DO NOTHING
          RETURNING id`;
        if (ins.length === 0) return false;
        const [upd] = await tx.$queryRaw<{ balance: number }[]>`
          UPDATE star_wallets
          SET balance = balance - ${take}::int,
              debt = debt + ${owed}::int,
              updated_at = now()
          WHERE user_id = ${p.user_id}::uuid
          RETURNING balance`;
        await tx.$executeRaw`
          UPDATE star_ledger SET balance_after = ${upd?.balance ?? 0}
          WHERE id = ${ins[0].id}::uuid`;
        return true;
      });
      if (done) n += 1;
    }
    return n;
  }

  /** GET /admin/stars/debts — accounts that owe stars after a refund. */
  async debts(): Promise<StarsDebtDto[]> {
    const rows = await this.prisma.starWallet.findMany({
      where: { debt: { gt: 0 } },
      orderBy: { debt: 'desc' },
      take: 100,
    });
    return rows.map((w) => ({
      userId: w.user_id,
      debt: w.debt,
      balance: w.balance,
    }));
  }

  /** A paid stars checkout (webhook / fake page / the app's return) →
   * stars. Idempotent: only a pending purchase of this session moves, and
   * the ledger key `topup:<purchase>` blocks a second credit. */
  async applyCheckout(session: ProviderCheckoutSession): Promise<boolean> {
    if (session.metadata.kind !== STARS_CHECKOUT_KIND) return false;
    if (session.status !== 'complete') return false;
    if (session.paymentStatus && session.paymentStatus !== 'paid') return false;
    const id = session.metadata.purchaseId;
    if (!id) return false;
    return withTxRetry(this.prisma, async (tx) => {
      const p = await tx.starPurchase.findUnique({ where: { id } });
      // The webhook can beat the write of stripe_checkout_id (the session is
      // created first): a purchase with no id yet takes this session's.
      if (!p) return false;
      if (p.stripe_checkout_id && p.stripe_checkout_id !== session.id)
        return false;
      if (p.status !== 'pending_payment') return false;
      const now = new Date();
      const payment = await tx.payment.create({
        data: {
          user_id: p.user_id,
          stripe_payment_intent_id: session.paymentIntentId ?? null,
          amount_cents: session.amountTotalCents ?? p.price_cents,
          currency: 'usd',
          status: 'succeeded',
          paid_at: now,
        },
      });
      await tx.starPurchase.update({
        where: { id },
        data: {
          status: 'paid',
          paid_at: now,
          payment_id: payment.id,
          stripe_checkout_id: p.stripe_checkout_id ?? session.id,
        },
      });
      await this.credit(tx, p.user_id, p.stars, 'topup', `topup:${id}`, {
        refId: id,
        note: p.pack_id,
        bought: true,
      });
      return true;
    });
  }

  // ── gifts ─────────────────────────────────────────────────────────────

  /** GET /stars/gifts — the catalog the giver picks from. */
  async catalog(): Promise<GiftDto[]> {
    if (!(await this.enabled())) return [];
    const rows = await this.prisma.gift.findMany({
      where: { status: 'active', deleted_at: null },
      orderBy: [{ position: 'asc' }, { price_stars: 'asc' }],
    });
    const urls = await this.files.stickerUrls(rows.map((g) => g.file_id));
    return rows.map((g) => this.giftDto(g, urls));
  }

  private giftDto(g: Gift, urls: Map<string, string>): GiftDto {
    return {
      id: g.id,
      title: g.title,
      code: g.code,
      priceStars: g.price_stars,
      url: urls.get(g.file_id) ?? null,
    };
  }

  /** Before sending: the switch, the daily brake. */
  async assertMayGift(senderId: string): Promise<void> {
    await this.assertEnabled();
    const max = (await this.cfg()).giftsPerDayMax;
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const n = await this.prisma.giftSend.count({
      where: { sender_id: senderId, created_at: { gte: since } },
    });
    if (n >= max) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many gifts today.',
          details: { max },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Inside the caller's transaction: charges the giver and records the
   * gift. The caller adds the chat message (or nothing, for a profile gift).
   */
  async giveGift(
    tx: Tx,
    a: {
      giftId: string;
      senderId: string;
      recipientId: string;
      conversationId?: string;
      note?: string | null;
      anonymous?: boolean;
    },
  ): Promise<{ send: GiftSend; gift: Gift }> {
    const gift = await tx.gift.findFirst({
      where: { id: a.giftId, status: 'active', deleted_at: null },
    });
    if (!gift) throw notFound('Gift');
    const send = await tx.giftSend.create({
      data: {
        gift_id: gift.id,
        sender_id: a.senderId,
        recipient_id: a.recipientId,
        conversation_id: a.conversationId ?? null,
        price_stars: gift.price_stars,
        note: a.note?.trim() || null,
        anonymous: a.anonymous ?? false,
      },
    });
    await this.debit(
      tx,
      a.senderId,
      gift.price_stars,
      'gift_sent',
      `gift:${send.id}`,
      { refId: send.id, note: gift.title.slice(0, 120) },
    );
    await tx.gift.update({
      where: { id: gift.id },
      data: { sent_count: { increment: 1 } },
    });
    return { send, gift };
  }

  /** POST /stars/gifts/:giftId/send — a gift to a profile (no chat). */
  async sendToProfile(
    senderId: string,
    giftId: string,
    dto: SendProfileGiftDto,
  ): Promise<GiftSendDto> {
    await this.assertMayGift(senderId);
    if (dto.recipientId === senderId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'You cannot give a gift to yourself.',
        details: { field: 'recipientId' },
      });
    }
    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientId },
      select: { id: true, status: true },
    });
    if (!recipient || recipient.status !== 'active') throw notFound('User');
    await this.blocks.assertNotBlocked(senderId, dto.recipientId);
    await this.privacy?.assertAllowed(senderId, dto.recipientId, 'message');
    const { send, gift } = await withTxRetry(this.prisma, (tx) =>
      this.giveGift(tx, {
        giftId,
        senderId,
        recipientId: dto.recipientId,
        note: dto.note,
        anonymous: dto.anonymous,
      }),
    );
    await this.notifications.emit({
      type: 'gift_received',
      recipientId: dto.recipientId,
      payload: { giftSendId: send.id },
    });
    const urls = await this.files.stickerUrls([gift.file_id]);
    return this.sendDto(send, gift, urls, { sender: null });
  }

  /** Chat bubbles: gift-send id → DTO (no names: a locked case chat must
   * not tell who the other side is). */
  async forMessages(ids: string[]): Promise<Map<string, GiftSendDto>> {
    const out = new Map<string, GiftSendDto>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.giftSend.findMany({
      where: { id: { in: [...new Set(ids)] } },
      include: { gift: true },
    });
    const urls = await this.files.stickerUrls(rows.map((r) => r.gift.file_id));
    for (const r of rows) {
      out.set(r.id, this.sendDto(r, r.gift, urls, { sender: null }));
    }
    return out;
  }

  private sendDto(
    s: GiftSend,
    g: Gift,
    urls: Map<string, string>,
    o: { sender: { id: string; name: string } | null },
  ): GiftSendDto {
    return {
      id: s.id,
      gift: this.giftDto(g, urls),
      senderId: o.sender?.id ?? null,
      senderName: o.sender?.name ?? null,
      anonymous: s.anonymous,
      note: s.note,
      shown: s.shown,
      convertedStars: s.converted_at ? (s.converted_stars ?? 0) : null,
      createdAt: s.created_at.toISOString(),
    };
  }

  /**
   * GET /stars/users/:id/gifts — the profile showcase. Others see the shown
   * gifts only, with no names; the owner sees all of theirs (hidden too,
   * not converted) and who gave them unless the giver chose to stay
   * anonymous or the gift came through a case chat whose contacts are still
   * locked.
   */
  async showcase(
    viewerId: string,
    ownerId: string,
    cursor?: string,
  ): Promise<Page<GiftSendDto>> {
    const mine = viewerId === ownerId;
    if (!mine) await this.blocks.assertNotBlocked(viewerId, ownerId);
    const base: Prisma.GiftSendWhereInput = {
      recipient_id: ownerId,
      converted_at: null,
      ...(mine ? {} : { shown: true }),
    };
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.giftSend.findMany({
      where: {
        ...base,
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include: { gift: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: SHOWCASE_PAGE + 1,
    });
    const page = rows.slice(0, SHOWCASE_PAGE);
    const urls = await this.files.stickerUrls(page.map((r) => r.gift.file_id));
    const names: Map<string, { id: string; name: string }> = mine
      ? await this.safeSenders(page)
      : new Map<string, { id: string; name: string }>();
    const last = page[page.length - 1];
    return {
      items: page.map((r) =>
        this.sendDto(r, r.gift, urls, { sender: names.get(r.id) ?? null }),
      ),
      nextCursor:
        rows.length > SHOWCASE_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  private async safeSenders(
    rows: GiftSend[],
  ): Promise<Map<string, { id: string; name: string }>> {
    const open = rows.filter((r) => !r.anonymous);
    const convIds = [
      ...new Set(
        open.flatMap((r) => (r.conversation_id ? [r.conversation_id] : [])),
      ),
    ];
    const locked = new Set(
      (
        await this.prisma.conversation.findMany({
          where: {
            id: { in: convIds },
            case_id: { not: null },
            contacts_unlocked: false,
          },
          select: { id: true },
        })
      ).map((c) => c.id),
    );
    const visible = open.filter(
      (r) => !r.conversation_id || !locked.has(r.conversation_id),
    );
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(visible.map((r) => r.sender_id))] } },
      select: { id: true, first_name: true, last_name: true },
    });
    const byId = new Map(
      users.map((u) => [
        u.id,
        [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
      ]),
    );
    const out = new Map<string, { id: string; name: string }>();
    for (const r of visible) {
      const name = byId.get(r.sender_id);
      if (name) out.set(r.id, { id: r.sender_id, name });
    }
    return out;
  }

  /** PATCH /stars/received-gifts/:id — show on / hide from the profile. */
  async setShown(userId: string, id: string, shown: boolean): Promise<void> {
    const { count } = await this.prisma.giftSend.updateMany({
      where: { id, recipient_id: userId, converted_at: null },
      data: { shown },
    });
    if (count === 0) throw notFound('Gift');
  }

  /** POST /stars/received-gifts/:id/convert — the gift becomes stars (the
   * share set in admin; the rest is the platform's fee). Once. */
  async convert(userId: string, id: string): Promise<ConvertGiftResultDto> {
    await this.assertEnabled();
    const percent = (await this.cfg()).giftConvertPercent;
    return withTxRetry(this.prisma, async (tx) => {
      const g = await tx.giftSend.findFirst({
        where: { id, recipient_id: userId },
        include: { gift: true },
      });
      if (!g) throw notFound('Gift');
      const stars = convertedStars(g.price_stars, percent);
      if (stars <= 0) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Gifts cannot be turned into stars.',
        });
      }
      const { count } = await tx.giftSend.updateMany({
        where: { id, recipient_id: userId, converted_at: null },
        data: {
          converted_at: new Date(),
          converted_stars: stars,
          shown: false,
        },
      });
      if (count === 0) {
        throw new ConflictException({
          code: ErrorCode.CONTENT_INVALID_STATE,
          message: 'This gift was already turned into stars.',
        });
      }
      await this.credit(tx, userId, stars, 'gift_converted', `convert:${id}`, {
        refId: id,
        note: g.gift.title.slice(0, 120),
      });
      return { stars, balance: await this.balance(userId, tx) };
    });
  }

  // ── paid sticker packs ────────────────────────────────────────────────

  /**
   * Inside the install transaction: takes the pack's price once. A pack
   * bought before (removed, then added again) costs nothing — the ledger key
   * `pack:<user>:<pack>` remembers the purchase.
   */
  async chargeStickerPack(
    tx: Tx,
    userId: string,
    pack: { id: string; title: string; price_stars: number },
  ): Promise<void> {
    if (pack.price_stars <= 0) return;
    await this.assertEnabled();
    await this.debit(
      tx,
      userId,
      pack.price_stars,
      'sticker_pack',
      `pack:${userId}:${pack.id}`,
      { refId: pack.id, note: pack.title.slice(0, 120) },
    );
  }

  // ── admin ─────────────────────────────────────────────────────────────

  async adminGifts(): Promise<AdminGiftDto[]> {
    const rows = await this.prisma.gift.findMany({
      where: { deleted_at: null },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
    const urls = await this.files.stickerUrls(rows.map((g) => g.file_id));
    return rows.map((g) => this.adminGiftDto(g, urls));
  }

  private adminGiftDto(g: Gift, urls: Map<string, string>): AdminGiftDto {
    return {
      id: g.id,
      title: g.title,
      code: g.code,
      priceStars: g.price_stars,
      fileId: g.file_id,
      url: urls.get(g.file_id) ?? null,
      position: g.position,
      status: g.status,
      sentCount: g.sent_count,
      createdAt: g.created_at.toISOString(),
    };
  }

  async createGift(
    admin: AdminActor,
    dto: CreateGiftDto,
  ): Promise<AdminGiftDto> {
    await this.files.assertAttachable(admin.id, dto.fileId, ['sticker']);
    const used = await this.prisma.sticker.findUnique({
      where: { file_id: dto.fileId },
      select: { id: true },
    });
    const usedGift = await this.prisma.gift.findUnique({
      where: { file_id: dto.fileId },
      select: { id: true },
    });
    if (used || usedGift) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'This image is already used.',
      });
    }
    const position = await this.prisma.gift.count({
      where: { deleted_at: null },
    });
    const g = await this.prisma.gift.create({
      data: {
        title: dto.title,
        price_stars: dto.priceStars,
        file_id: dto.fileId,
        position,
      },
    });
    return this.adminGiftDto(g, await this.files.stickerUrls([g.file_id]));
  }

  async updateGift(id: string, dto: UpdateGiftDto): Promise<AdminGiftDto> {
    const cur = await this.prisma.gift.findFirst({
      where: { id, deleted_at: null },
    });
    if (!cur) throw notFound('Gift');
    const g = await this.prisma.gift.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.priceStars !== undefined
          ? { price_stars: dto.priceStars }
          : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return this.adminGiftDto(g, await this.files.stickerUrls([g.file_id]));
  }

  /** Gifts already given stay on profiles and in chats; the catalog drops it. */
  async deleteGift(id: string): Promise<void> {
    const { count } = await this.prisma.gift.updateMany({
      where: { id, deleted_at: null },
      data: { deleted_at: new Date(), status: 'hidden' },
    });
    if (count === 0) throw notFound('Gift');
  }

  /** The owner adds or takes back stars by hand (a refund on Stripe, a
   * present). Written to the ledger with the admin's reason. */
  async grant(
    admin: AdminActor,
    userId: string,
    amount: number,
    reason: string,
  ): Promise<number> {
    if (amount === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The amount cannot be zero.',
        details: { field: 'amount' },
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw notFound('User');
    const key = `grant:${admin.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const note = reason.slice(0, 120);
    return withTxRetry(this.prisma, async (tx) => {
      if (amount > 0) {
        await this.credit(tx, userId, amount, 'admin_grant', key, { note });
      } else {
        await this.debit(tx, userId, -amount, 'admin_grant', key, { note });
      }
      return this.balance(userId, tx);
    });
  }

  async report(days: number): Promise<StarsReportDto> {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const [sold, spent, wallets, gifts, converted, kinds, top, debtUsers] =
      await Promise.all([
        this.prisma.starPurchase.aggregate({
          where: { status: 'paid', paid_at: { gte: since } },
          _sum: { stars: true, price_cents: true },
          _count: true,
        }),
        this.prisma.starLedger.aggregate({
          where: {
            delta: { lt: 0 },
            kind: { in: ['gift_sent', 'sticker_pack'] },
            created_at: { gte: since },
          },
          _sum: { delta: true },
        }),
        this.prisma.starWallet.aggregate({
          _sum: { balance: true, debt: true },
        }),
        this.prisma.giftSend.count({ where: { created_at: { gte: since } } }),
        this.prisma.giftSend.aggregate({
          where: { converted_at: { gte: since } },
          _sum: { converted_stars: true },
        }),
        this.prisma.starLedger.groupBy({
          by: ['kind'],
          where: { created_at: { gte: since } },
          _sum: { delta: true },
          _count: true,
        }),
        this.prisma.giftSend.groupBy({
          by: ['gift_id'],
          where: { created_at: { gte: since } },
          _sum: { price_stars: true },
          _count: true,
          orderBy: { _sum: { price_stars: 'desc' } },
          take: 5,
        }),
        this.prisma.starWallet.count({ where: { debt: { gt: 0 } } }),
      ]);
    const titles = new Map(
      (
        await this.prisma.gift.findMany({
          where: { id: { in: top.map((t) => t.gift_id) } },
          select: { id: true, title: true },
        })
      ).map((g) => [g.id, g.title]),
    );
    return {
      days,
      starsSold: sold._sum.stars ?? 0,
      revenueCents: sold._sum.price_cents ?? 0,
      purchases: sold._count,
      starsSpent: -(spent._sum.delta ?? 0),
      outstandingStars: wallets._sum.balance ?? 0,
      debtStars: wallets._sum.debt ?? 0,
      debtUsers,
      giftsSent: gifts,
      starsConverted: converted._sum.converted_stars ?? 0,
      byKind: kinds.map((k): StarsKindTotalDto => ({
        kind: k.kind,
        stars: k._sum.delta ?? 0,
        count: k._count,
      })),
      topGifts: top.map((t) => ({
        title: titles.get(t.gift_id) ?? '—',
        sent: t._count,
        stars: t._sum.price_stars ?? 0,
      })),
    };
  }
}
