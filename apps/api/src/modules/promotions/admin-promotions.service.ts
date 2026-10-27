import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { CasePromotion, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { ReferralsService } from '../referrals/referrals.service';
import { StarsService } from '../stars/stars.service';
import { RefundsService } from '../admin-billing/refunds.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PromotionDeliveryService } from './promotion-delivery.service';
import { PromotionsRollupService } from './promotions-rollup.service';
import type {
  PromotionRefundMode,
  AdminPromotionActionResultDto,
  AdminPromotionRowDto,
  AdminPromotionsQueryDto,
  AdminPromotionStatsDto,
  UpdatePromotionSettingsDto,
} from './promotions.dto';
import { PromotionsService, toPromotionDto } from './promotions.service';
import {
  billingOf,
  mergePricing,
  parsePromotionSettings,
  pricingTargetOf,
  PROMOTION_SETTINGS_KEY,
  targetUnits,
  unitsFor,
  unspentShare,
  type PromotionSettings,
  type PromotionTarget,
} from './promotions.settings';

const PAGE = 50;
const DAY_MS = 86_400_000;

export const PROMOTION_AUDIT = {
  settings: 'promotions.settings',
  pricing: 'promotions.pricing',
  grant: 'promotions.grant',
  cancel: 'promotions.cancel',
  extend: 'promotions.extend',
  review: 'promotions.review',
} as const;

type Page<T> = { items: T[]; nextCursor: string | null };

function invalidState(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.PROMOTION_INVALID_STATE,
    message,
  });
}

/** Owner 2026-10-02: case promotions in the admin. */
@Injectable()
export class AdminPromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
    private readonly referrals: ReferralsService,
    private readonly audit: AuditLogService,
    @Optional() private readonly refunds?: RefundsService,
    @Optional() private readonly delivery?: PromotionDeliveryService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly stars?: StarsService,
    // Owner 2026-10-27: the by-model money numbers come from a nightly snapshot.
    @Optional() private readonly rollup?: PromotionsRollupService,
  ) {}

  getSettings(): Promise<PromotionSettings> {
    return this.promotions.settings();
  }

  /** True when [dto] changes a price or switch of the per-model matrix (or the
   * old single CPM, which moves the views price). */
  async pricingWouldChange(dto: UpdatePromotionSettingsDto): Promise<boolean> {
    if (dto.pricing === undefined && dto.cpmCents === undefined) return false;
    const current = await this.promotions.settings();
    const next = this.nextSettings(current, dto);
    return JSON.stringify(next.pricing) !== JSON.stringify(current.pricing);
  }

  private nextSettings(
    current: PromotionSettings,
    dto: UpdatePromotionSettingsDto,
  ): PromotionSettings {
    const sent = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    // Owner 2026-10-27: the prices per model are merged target by target; an
    // older admin build that only knows the single CPM still moves the views
    // price of posts, videos and cases.
    let pricing = mergePricing(current.pricing, dto.pricing, current.cpmCents);
    if (
      !dto.pricing &&
      dto.cpmCents !== undefined &&
      dto.cpmCents !== current.cpmCents
    ) {
      pricing = mergePricing(
        pricing,
        Object.fromEntries(
          (['post', 'video', 'case'] as const).map((t) => [
            t,
            { models: { impressions: { priceCents: dto.cpmCents } } },
          ]),
        ),
        current.cpmCents,
      );
    }
    return parsePromotionSettings({ ...current, ...sent, pricing });
  }

  async updateSettings(
    admin: AdminActor,
    dto: UpdatePromotionSettingsDto,
  ): Promise<PromotionSettings> {
    if (
      dto.feedEveryN !== undefined &&
      (dto.feedEveryN < 10 || dto.feedEveryN > 15)
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'feedEveryN must be between 10 and 15.',
      });
    }
    // A field that is not sent keeps its stored value; the result is
    // normalised the same way it is read (presets inside min/max, …).
    const current = await this.promotions.settings();
    const next = this.nextSettings(current, dto);
    const priced =
      JSON.stringify(next.pricing) !== JSON.stringify(current.pricing);
    const value = next as unknown as Prisma.InputJsonValue;
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({
        where: { key: PROMOTION_SETTINGS_KEY },
      });
      await tx.appConfig.upsert({
        where: { key: PROMOTION_SETTINGS_KEY },
        create: { key: PROMOTION_SETTINGS_KEY, value },
        update: { value },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          // A change of the prices / switches per way to pay has its own
          // label in the log (owner 2026-10-27).
          action: priced ? PROMOTION_AUDIT.pricing : PROMOTION_AUDIT.settings,
          targetType: 'app_config',
          targetId: null,
          before: before?.value ?? null,
          after: value,
          ip: admin.ip,
        },
        tx,
      );
    });
    this.delivery?.invalidate();
    return next;
  }

  async list(q: AdminPromotionsQueryDto): Promise<Page<AdminPromotionRowDto>> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.casePromotion.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.target ? { target_type: q.target } : {}),
        ...(q.caseId ? { case_id: q.caseId } : {}),
        ...(q.postId ? { post_id: q.postId } : {}),
        ...(q.userId ? { user_id: q.userId } : {}),
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { lt: cursor.id } },
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
      items: await this.present(page),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async stats(now = new Date()): Promise<AdminPromotionStatsDto> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const live = {
      status: 'active',
      starts_at: { lte: now },
      ends_at: { gt: now },
    };
    const [activeCount, paid, byStatus, activePosts, delivered] =
      await Promise.all([
        this.prisma.casePromotion.count({ where: live }),
        this.prisma.casePromotion.findMany({
          where: { payment_id: { not: null }, created_at: { gte: since } },
          select: { payment_id: true },
          take: 10_000,
        }),
        this.prisma.casePromotion.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.casePromotion.count({
          where: { ...live, target_type: 'post' },
        }),
        this.prisma.casePromotion.aggregate({
          where: { created_at: { gte: since } },
          _sum: { impressions: true, reach: true, clicks: true },
        }),
      ]);
    const byModel = await this.rollup?.read();
    const paymentIds = paid
      .map((p) => p.payment_id)
      .filter((id): id is string => !!id);
    // Refunded payments (Payments screen) drop out of the revenue.
    const revenue = paymentIds.length
      ? await this.prisma.payment.aggregate({
          where: { id: { in: paymentIds }, status: 'succeeded' },
          _sum: { amount_cents: true },
          _count: { _all: true },
        })
      : { _sum: { amount_cents: 0 }, _count: { _all: 0 } };
    return {
      activeCount,
      revenue30dCents: revenue._sum.amount_cents ?? 0,
      paid30dCount: revenue._count._all,
      byStatus: byStatus.map((r) => ({
        status: r.status,
        count: r._count._all,
      })),
      activePosts,
      activeCases: activeCount - activePosts,
      pendingReview:
        byStatus.find((r) => r.status === 'pending_review')?._count._all ?? 0,
      impressions30d: delivered._sum.impressions ?? 0,
      reach30d: delivered._sum.reach ?? 0,
      clicks30d: delivered._sum.clicks ?? 0,
      byModel: byModel?.rows ?? [],
      byModelAt: byModel?.at ?? null,
    };
  }

  /** A free promotion (no payment), starting now or after the running one. */
  async grant(
    admin: AdminActor,
    targetId: string,
    days: number,
    reason: string,
    opts: { target?: PromotionTarget; dailyBudgetCents?: number } = {},
  ): Promise<AdminPromotionActionResultDto> {
    const settings = await this.promotions.settings();
    const type = opts.target ?? 'case';
    const views =
      settings.pricing[pricingTargetOf(type)].models.impressions.priceCents;
    const daily = Math.max(
      1,
      opts.dailyBudgetCents ?? settings.priceCentsPerDay,
    );
    const row = await withTxRetry(this.prisma, async (tx) => {
      let ownerId: string;
      if (type === 'post') {
        const post = await tx.post.findUnique({
          where: { id: targetId },
          select: { author_id: true, status: true, deleted_at: true },
        });
        if (!post || post.deleted_at) {
          throw new NotFoundException({
            code: ErrorCode.POST_NOT_FOUND,
            message: 'Post not found.',
          });
        }
        if (post.status !== 'published') {
          throw new ConflictException({
            code: ErrorCode.CASE_INVALID_STATE,
            message: 'Only a published post can be promoted.',
          });
        }
        ownerId = post.author_id;
      } else {
        const kase = await tx.case.findUnique({
          where: { id: targetId },
          select: { client_id: true, status: true, deleted_at: true },
        });
        if (!kase || kase.deleted_at) {
          throw new NotFoundException({
            code: ErrorCode.CASE_NOT_FOUND,
            message: 'Case not found.',
          });
        }
        if (kase.status !== 'open') {
          throw new ConflictException({
            code: ErrorCode.CASE_INVALID_STATE,
            message: 'Only an open case can be promoted.',
          });
        }
        ownerId = kase.client_id;
      }
      const now = new Date();
      const running = await tx.casePromotion.findFirst({
        where: {
          ...(type === 'post' ? { post_id: targetId } : { case_id: targetId }),
          status: 'active',
          ends_at: { gt: now },
        },
        select: { id: true },
      });
      if (running) {
        throw new ConflictException({
          code: ErrorCode.PROMOTION_ALREADY_ACTIVE,
          message: 'It is already promoted — extend that promotion.',
        });
      }
      const created = await tx.casePromotion.create({
        data: {
          target_type: type,
          case_id: type === 'case' ? targetId : null,
          post_id: type === 'post' ? targetId : null,
          user_id: ownerId,
          days,
          price_cents_per_day: daily,
          total_cents: 0,
          // A free boost is always paid in views, at the views price of the
          // thing (the owner's other switches do not matter for a grant).
          billing: 'impressions',
          unit_price_cents: views,
          target_units: unitsFor('impressions', days * daily, views),
          cpm_cents: views,
          target_impressions: unitsFor('impressions', days * daily, views),
          status: 'active',
          starts_at: now,
          ends_at: new Date(now.getTime() + days * DAY_MS),
          granted_by: admin.id,
          reviewed_by: admin.id,
          reviewed_at: now,
        },
      });
      await this.record(
        admin,
        PROMOTION_AUDIT.grant,
        null,
        created,
        reason,
        tx,
      );
      return created;
    });
    await this.promotions.started(row);
    return { promotion: (await this.present([row]))[0], note: null };
  }

  /** Approve (starts now) or reject (refunded in full) a promotion that
   * waits for a staff check. */
  async review(
    admin: AdminActor,
    id: string,
    decision: 'approve' | 'reject',
    reason: string,
  ): Promise<AdminPromotionActionResultDto> {
    if (decision === 'reject') {
      const res = await this.cancel(admin, id, reason || 'rejected', 'full', {
        status: 'rejected',
        allowed: ['pending_review'],
      });
      const row = await this.prisma.casePromotion.findUnique({ where: { id } });
      if (row) {
        await this.notifications
          ?.emit({
            type: 'promotion_ended',
            recipientId: row.user_id,
            payload: {
              promotionId: id,
              rejected: true,
              ...(row.case_id ? { caseId: row.case_id } : {}),
              ...(row.post_id ? { postId: row.post_id } : {}),
            },
          })
          .catch(() => undefined);
      }
      return res;
    }
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.mustFind(tx, id);
      if (before.status !== 'pending_review') {
        throw invalidState(
          'Only a promotion waiting for a check can be approved.',
        );
      }
      const now = new Date();
      const startsAt = await this.promotions.startAfterRunning(tx, before, now);
      const after = await tx.casePromotion.update({
        where: { id },
        data: {
          status: 'active',
          starts_at: startsAt,
          ends_at: new Date(startsAt.getTime() + before.days * DAY_MS),
          reviewed_by: admin.id,
          reviewed_at: now,
        },
      });
      await this.record(
        admin,
        PROMOTION_AUDIT.review,
        before,
        after,
        reason,
        tx,
      );
      return after;
    });
    await this.promotions.started(row);
    return { promotion: (await this.present([row]))[0], note: null };
  }

  async cancel(
    admin: AdminActor,
    id: string,
    reason: string,
    refund: PromotionRefundMode = 'none',
    opts: { status?: 'canceled' | 'rejected'; allowed?: string[] } = {},
  ): Promise<AdminPromotionActionResultDto> {
    const allowed = opts.allowed ?? [
      'active',
      'pending_payment',
      'pending_review',
    ];
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.mustFind(tx, id);
      if (!allowed.includes(before.status)) {
        throw invalidState(
          'Only an active, unpaid or waiting promotion can be canceled.',
        );
      }
      const after = await tx.casePromotion.update({
        where: { id },
        data: {
          status: opts.status ?? 'canceled',
          canceled_by: admin.id,
          cancel_reason: reason,
        },
      });
      if (before.status === 'pending_payment') {
        await this.referrals.restorePromotionCredits(tx, before.user_id, id);
      }
      await this.record(
        admin,
        PROMOTION_AUDIT.cancel,
        before,
        after,
        reason,
        tx,
      );
      return after;
    });
    this.delivery?.invalidate();
    let note: string | null = null;
    if (row.paid_stars > 0 && this.stars) {
      const back = this.refundAmount(
        row,
        refund,
        row.paid_stars,
        row.refunded_stars,
      );
      if (back > 0) {
        const done = await withTxRetry(this.prisma, async (tx) => {
          const ok = await this.stars!.credit(
            tx,
            row.user_id,
            back,
            'boost_refund',
            `boost_refund:${row.id}`,
            { refId: row.id },
          );
          if (ok) {
            await tx.casePromotion.update({
              where: { id: row.id },
              data: {
                refunded_stars: { increment: back },
                ...(back >= row.paid_stars ? { status: 'refunded' } : {}),
              },
            });
          }
          return ok;
        });
        const fresh = await this.prisma.casePromotion.findUniqueOrThrow({
          where: { id: row.id },
        });
        return {
          promotion: (await this.present([fresh]))[0],
          note: done ? null : 'The stars were already returned.',
        };
      }
      note = 'This promotion was paid with stars: none were returned.';
      return { promotion: (await this.present([row]))[0], note };
    }
    const amount = this.refundAmount(row, refund);
    if (row.payment_id && amount > 0 && this.refunds) {
      await this.refunds.refund(admin, {
        paymentId: row.payment_id,
        amountCents: amount,
        reason: reason || 'promotion canceled',
      });
      const refunded = await this.prisma.casePromotion.update({
        where: { id },
        data: {
          refunded_cents: { increment: amount },
          ...(amount >= row.total_cents ? { status: 'refunded' } : {}),
        },
      });
      return { promotion: (await this.present([refunded]))[0], note: null };
    }
    if (row.payment_id && refund === 'none') {
      note = 'This promotion was paid: no money was returned.';
    }
    return { promotion: (await this.present([row]))[0], note };
  }

  /** Cents to give back: all, or the share of impressions not delivered. */
  private refundAmount(
    p: CasePromotion,
    mode: PromotionRefundMode,
    total = p.total_cents,
    already = p.refunded_cents,
  ): number {
    const left = Math.max(0, total - already);
    if (mode === 'full') return left;
    if (mode !== 'unspent') return 0;
    if (!targetUnits(p)) {
      // Older rows: by time left.
      if (!p.starts_at || !p.ends_at) return left;
      const span = p.ends_at.getTime() - p.starts_at.getTime();
      const rest = Math.max(0, p.ends_at.getTime() - Date.now());
      return Math.min(left, Math.floor((total * rest) / Math.max(1, span)));
    }
    // The undelivered share, in the unit the boost was paid for.
    return unspentShare(p, total, already);
  }

  async extend(
    admin: AdminActor,
    id: string,
    days: number,
    reason: string,
  ): Promise<AdminPromotionActionResultDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.mustFind(tx, id);
      if (
        before.status !== 'active' ||
        !before.ends_at ||
        before.ends_at.getTime() <= Date.now()
      ) {
        throw invalidState('Only a running promotion can be extended.');
      }
      const after = await tx.casePromotion.update({
        where: { id },
        data: {
          days: before.days + days,
          ends_at: new Date(before.ends_at.getTime() + days * DAY_MS),
          ...(targetUnits(before) !== null
            ? (() => {
                const more = unitsFor(
                  billingOf(before.billing),
                  days * before.price_cents_per_day,
                  before.unit_price_cents ?? before.cpm_cents ?? 500,
                );
                return {
                  target_units: (targetUnits(before) ?? 0) + more,
                  ...(before.target_impressions !== null
                    ? { target_impressions: before.target_impressions + more }
                    : {}),
                };
              })()
            : {}),
        },
      });
      this.delivery?.invalidate();
      await this.record(
        admin,
        PROMOTION_AUDIT.extend,
        before,
        after,
        reason,
        tx,
      );
      return after;
    });
    return { promotion: (await this.present([row]))[0], note: null };
  }

  // ---- helpers ------------------------------------------------------------

  private async mustFind(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<CasePromotion> {
    const row = await tx.casePromotion.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Promotion not found.',
      });
    }
    return row;
  }

  private async record(
    admin: AdminActor,
    action: string,
    before: CasePromotion | null,
    after: CasePromotion,
    reason: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const view = (p: CasePromotion) =>
      ({
        targetType: p.target_type,
        caseId: p.case_id,
        postId: p.post_id,
        status: p.status,
        days: p.days,
        endsAt: p.ends_at?.toISOString() ?? null,
        totalCents: p.total_cents,
        paymentId: p.payment_id,
        billing: p.billing,
        unitPriceCents: p.unit_price_cents,
        targetUnits: p.target_units,
      }) as Prisma.InputJsonObject;
    await this.audit.record(
      {
        adminId: admin.id,
        action,
        targetType: 'case_promotion',
        targetId: after.id,
        before: before ? view(before) : null,
        after: { ...view(after), reason },
        ip: admin.ip,
      },
      tx,
    );
  }

  private async present(
    rows: CasePromotion[],
  ): Promise<AdminPromotionRowDto[]> {
    if (rows.length === 0) return [];
    const caseIds = rows.flatMap((r) => (r.case_id ? [r.case_id] : []));
    const [cases, users, titles] = await Promise.all([
      caseIds.length
        ? this.prisma.case.findMany({
            where: { id: { in: [...new Set(caseIds)] } },
            select: { id: true, status: true },
          })
        : [],
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.user_id))] } },
        select: { id: true, first_name: true, last_name: true, email: true },
      }),
      this.promotions.titles(rows),
    ]);
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const userById = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const c = r.case_id ? caseById.get(r.case_id) : undefined;
      const u = userById.get(r.user_id);
      return {
        ...toPromotionDto(r),
        caseTitle: titles.get(r.id) ?? '',
        caseStatus: r.post_id ? 'post' : (c?.status ?? 'unknown'),
        ownerId: r.user_id,
        ownerName: u
          ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null
          : null,
        ownerEmail: u?.email ?? null,
        paymentId: r.payment_id,
        promoCodeId: r.promo_code_id,
        grantedBy: r.granted_by,
        reviewedBy: r.reviewed_by,
        refundedCents: r.refunded_cents,
        cpmCents: r.cpm_cents,
      };
    });
  }
}
