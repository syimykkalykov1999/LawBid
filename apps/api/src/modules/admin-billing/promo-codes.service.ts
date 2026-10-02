import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PromoCode } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  PAYMENT_PROVIDER,
  SUBSCRIPTION_CURRENCY,
} from '../billing/billing.constants';
import { refreshProvider } from '../billing/dynamic-payment.provider';
import type { PaymentProvider } from '../billing/payment-provider';
import type {
  CreatePromoCodeDto,
  PromoCodeDto,
  PromoRedemptionDto,
  PromoStatus,
  PromoValidationDto,
  UpdatePromoCodeDto,
  ValidatePromoDto,
} from './admin-billing.dto';
import {
  ADMIN_BILLING_PAGE,
  afterCursor,
  type Page,
  toPage,
  usersById,
} from './admin-billing.util';
import {
  checkPromo,
  couponInput,
  normalizePromoCode,
  type PromoAppliesTo,
  type PromoAudience,
  type PromoDiscountType,
} from './promo-rules';

export function promoStatus(p: PromoCode, now = new Date()): PromoStatus {
  if (!p.active) return 'inactive';
  if (p.expires_at && p.expires_at <= now) return 'expired';
  if (p.max_redemptions !== null && p.redeemed_count >= p.max_redemptions)
    return 'exhausted';
  if (p.starts_at && p.starts_at > now) return 'scheduled';
  return 'active';
}

/**
 * Owner 2026-10-02: promo codes (percent / amount / free days). With
 * Stripe configured a matching coupon + promotion code is created; when it
 * isn't (or Stripe fails) the code is DB-only and the coupon is created on
 * its first checkout (promo-rules.ensurePromoCoupon).
 */
@Injectable()
export class PromoCodesService {
  private readonly logger = new Logger(PromoCodesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly audit: AuditLogService,
  ) {}

  async list(q: {
    status?: 'active' | 'expired' | 'inactive';
    q?: string;
    cursor?: string;
  }): Promise<Page<PromoCodeDto>> {
    const now = new Date();
    const status: Prisma.PromoCodeWhereInput =
      q.status === 'active'
        ? {
            active: true,
            OR: [{ expires_at: null }, { expires_at: { gt: now } }],
          }
        : q.status === 'expired'
          ? { expires_at: { lte: now } }
          : q.status === 'inactive'
            ? { active: false }
            : {};
    const rows = await this.prisma.promoCode.findMany({
      where: {
        AND: [
          status,
          q.q ? { code: { startsWith: q.q } } : {},
          afterCursor(q.cursor),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => presentPromo(r, now));
  }

  async create(
    admin: AdminActor,
    dto: CreatePromoCodeDto,
  ): Promise<PromoCodeDto> {
    const code = normalizePromoCode(dto.code);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= (startsAt ?? new Date())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'expiresAt must be after startsAt (or now).',
        details: { field: 'expiresAt' },
      });
    }
    const type = dto.discountType;
    let row: PromoCode;
    try {
      row = await this.prisma.promoCode.create({
        data: {
          code,
          description: dto.description || null,
          discount_type: type,
          percent_off: type === 'percent' ? (dto.percentOff ?? null) : null,
          amount_off_cents:
            type === 'amount' ? (dto.amountOffCents ?? null) : null,
          free_days: type === 'free_days' ? (dto.freeDays ?? null) : null,
          audience: dto.audience ?? 'attorney',
          applies_to: dto.appliesTo ?? 'any',
          max_redemptions: dto.maxRedemptions ?? null,
          starts_at: startsAt,
          expires_at: expiresAt,
          created_by: admin.id,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCode.PROMO_CODE_EXISTS,
          message: 'A promo code with this code already exists.',
          details: { field: 'code' },
        });
      }
      throw e;
    }
    row = await this.syncCoupon(row);
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.promo_code.create',
      targetType: 'promo_code',
      targetId: row.id,
      after: snapshot(row),
      ip: admin.ip,
    });
    return presentPromo(row);
  }

  async update(
    admin: AdminActor,
    id: string,
    dto: UpdatePromoCodeDto,
  ): Promise<PromoCodeDto> {
    const before = await this.must(id);
    const data: Prisma.PromoCodeUpdateInput = {};
    if (dto.description !== undefined)
      data.description = dto.description || null;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.maxRedemptions !== undefined)
      data.max_redemptions = dto.maxRedemptions;
    if (dto.expiresAt !== undefined)
      data.expires_at = dto.expiresAt ? new Date(dto.expiresAt) : null;
    // Stripe coupons are immutable: limits changed or the code switched
    // off → the old coupon goes; a new one is made on next use.
    const limitsChanged =
      (dto.maxRedemptions !== undefined &&
        dto.maxRedemptions !== before.max_redemptions) ||
      (dto.expiresAt !== undefined &&
        (dto.expiresAt ? new Date(dto.expiresAt).getTime() : null) !==
          (before.expires_at?.getTime() ?? null)) ||
      dto.active === false;
    if (limitsChanged && before.stripe_coupon_id) {
      await this.dropCoupon(before.stripe_coupon_id);
      data.stripe_coupon_id = null;
    }
    let row = await this.prisma.promoCode.update({ where: { id }, data });
    if (limitsChanged && row.active) row = await this.syncCoupon(row);
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.promo_code.update',
      targetType: 'promo_code',
      targetId: id,
      before: snapshot(before),
      after: snapshot(row),
      ip: admin.ip,
    });
    return presentPromo(row);
  }

  deactivate(admin: AdminActor, id: string): Promise<PromoCodeDto> {
    return this.update(admin, id, { active: false });
  }

  async redemptions(
    id: string,
    cursor?: string,
  ): Promise<Page<PromoRedemptionDto>> {
    await this.must(id);
    const rows = await this.prisma.promoRedemption.findMany({
      where: { AND: [{ promo_id: id }, afterCursor(cursor)] },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const users = await usersById(
      this.prisma,
      rows.map((r) => r.user_id),
    );
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => ({
      id: r.id,
      promoId: r.promo_id,
      userId: r.user_id,
      user: users.get(r.user_id) ?? null,
      amountOffCents: r.amount_off_cents,
      paymentId: r.payment_id,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /** POST /billing/promo/validate — the app shows the discount first. */
  async validate(
    user: RequestUser,
    dto: ValidatePromoDto,
  ): Promise<PromoValidationDto> {
    const check = await checkPromo(this.prisma, {
      code: dto.code,
      userId: user.sub,
      role: user.role,
      purchase: dto.appliesTo,
    });
    const code = normalizePromoCode(dto.code);
    if (!check.valid) {
      return {
        valid: false,
        code,
        discountType: null,
        percentOff: null,
        amountOffCents: null,
        freeDays: null,
        description: null,
        reason: check.reason,
      };
    }
    const p = check.promo;
    return {
      valid: true,
      code: p.code,
      discountType: p.discount_type as PromoDiscountType,
      percentOff: p.percent_off,
      amountOffCents: p.amount_off_cents,
      freeDays: p.free_days,
      description: p.description,
      reason: null,
    };
  }

  // ------------------------------------------------------------------

  private async must(id: string): Promise<PromoCode> {
    const row = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Promo code not found.',
      });
    }
    return row;
  }

  /** Best effort: a Stripe coupon for percent / amount codes. */
  private async syncCoupon(row: PromoCode): Promise<PromoCode> {
    if (row.discount_type === 'free_days' || row.stripe_coupon_id) return row;
    try {
      await refreshProvider(this.provider);
      if (
        this.provider.name !== 'stripe' ||
        typeof this.provider.createCoupon !== 'function'
      ) {
        return row;
      }
      const c = await this.provider.createCoupon(
        couponInput(row, SUBSCRIPTION_CURRENCY),
      );
      return await this.prisma.promoCode.update({
        where: { id: row.id },
        data: { stripe_coupon_id: c.couponId },
      });
    } catch (e) {
      this.logger.warn(
        `promo ${row.code}: Stripe coupon not created (${String(e)}); DB-only until first checkout`,
      );
      return row;
    }
  }

  private async dropCoupon(couponId: string): Promise<void> {
    try {
      if (typeof this.provider.deleteCoupon === 'function')
        await this.provider.deleteCoupon(couponId);
    } catch (e) {
      this.logger.warn(`coupon ${couponId} not deleted: ${String(e)}`);
    }
  }
}

function snapshot(p: PromoCode): Prisma.InputJsonObject {
  return {
    code: p.code,
    discountType: p.discount_type,
    percentOff: p.percent_off,
    amountOffCents: p.amount_off_cents,
    freeDays: p.free_days,
    audience: p.audience,
    appliesTo: p.applies_to,
    maxRedemptions: p.max_redemptions,
    expiresAt: p.expires_at?.toISOString() ?? null,
    active: p.active,
  };
}

export function presentPromo(p: PromoCode, now = new Date()): PromoCodeDto {
  return {
    id: p.id,
    code: p.code,
    description: p.description,
    discountType: p.discount_type as PromoDiscountType,
    percentOff: p.percent_off,
    amountOffCents: p.amount_off_cents,
    freeDays: p.free_days,
    audience: p.audience as PromoAudience,
    appliesTo: p.applies_to as PromoAppliesTo,
    maxRedemptions: p.max_redemptions,
    redeemedCount: p.redeemed_count,
    startsAt: p.starts_at?.toISOString() ?? null,
    expiresAt: p.expires_at?.toISOString() ?? null,
    active: p.active,
    status: promoStatus(p, now),
    stripeCouponId: p.stripe_coupon_id,
    createdBy: p.created_by,
    createdAt: p.created_at.toISOString(),
  };
}
