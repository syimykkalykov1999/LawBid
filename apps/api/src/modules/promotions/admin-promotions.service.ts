import {
  ConflictException,
  Injectable,
  NotFoundException,
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
import type {
  AdminPromotionActionResultDto,
  AdminPromotionRowDto,
  AdminPromotionsQueryDto,
  AdminPromotionStatsDto,
  PromotionSettingsDto,
} from './promotions.dto';
import { PromotionsService, toPromotionDto } from './promotions.service';
import {
  PROMOTION_SETTINGS_KEY,
  type PromotionSettings,
} from './promotions.settings';

const PAGE = 50;
const DAY_MS = 86_400_000;

export const PROMOTION_AUDIT = {
  settings: 'promotions.settings',
  grant: 'promotions.grant',
  cancel: 'promotions.cancel',
  extend: 'promotions.extend',
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
  ) {}

  getSettings(): Promise<PromotionSettings> {
    return this.promotions.settings();
  }

  async updateSettings(
    admin: AdminActor,
    dto: PromotionSettingsDto,
  ): Promise<PromotionSettings> {
    const next: PromotionSettings = {
      enabled: dto.enabled,
      priceCentsPerDay: dto.priceCentsPerDay,
      maxDays: dto.maxDays,
      maxActivePerCase: dto.maxActivePerCase,
    };
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
          action: PROMOTION_AUDIT.settings,
          targetType: 'app_config',
          targetId: null,
          before: before?.value ?? null,
          after: value,
          ip: admin.ip,
        },
        tx,
      );
    });
    return next;
  }

  async list(q: AdminPromotionsQueryDto): Promise<Page<AdminPromotionRowDto>> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.casePromotion.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.caseId ? { case_id: q.caseId } : {}),
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
    const [activeCount, paid, byStatus] = await Promise.all([
      this.prisma.casePromotion.count({
        where: {
          status: 'active',
          starts_at: { lte: now },
          ends_at: { gt: now },
        },
      }),
      this.prisma.casePromotion.findMany({
        where: { payment_id: { not: null }, created_at: { gte: since } },
        select: { payment_id: true },
        take: 10_000,
      }),
      this.prisma.casePromotion.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
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
    };
  }

  /** A free promotion (no payment), starting now or after the running one. */
  async grant(
    admin: AdminActor,
    caseId: string,
    days: number,
    reason: string,
  ): Promise<AdminPromotionActionResultDto> {
    const settings = await this.promotions.settings();
    const row = await withTxRetry(this.prisma, async (tx) => {
      const kase = await tx.case.findUnique({
        where: { id: caseId },
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
      const now = new Date();
      const running = await tx.casePromotion.findFirst({
        where: { case_id: caseId, status: 'active', ends_at: { gt: now } },
        select: { id: true },
      });
      if (running) {
        throw new ConflictException({
          code: ErrorCode.PROMOTION_ALREADY_ACTIVE,
          message: 'The case is already promoted — extend that promotion.',
        });
      }
      const created = await tx.casePromotion.create({
        data: {
          case_id: caseId,
          user_id: kase.client_id,
          days,
          price_cents_per_day: settings.priceCentsPerDay,
          total_cents: 0,
          status: 'active',
          starts_at: now,
          ends_at: new Date(now.getTime() + days * DAY_MS),
          granted_by: admin.id,
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
    return { promotion: (await this.present([row]))[0], note: null };
  }

  async cancel(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminPromotionActionResultDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await this.mustFind(tx, id);
      if (before.status !== 'active' && before.status !== 'pending_payment') {
        throw invalidState(
          'Only an active or unpaid promotion can be canceled.',
        );
      }
      const after = await tx.casePromotion.update({
        where: { id },
        data: {
          status: 'canceled',
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
    return {
      promotion: (await this.present([row]))[0],
      note: row.payment_id
        ? 'This promotion was paid: issue the refund from the Payments screen.'
        : null,
    };
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
        },
      });
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
        caseId: p.case_id,
        status: p.status,
        days: p.days,
        endsAt: p.ends_at?.toISOString() ?? null,
        totalCents: p.total_cents,
        paymentId: p.payment_id,
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
    const [cases, users] = await Promise.all([
      this.prisma.case.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.case_id))] } },
        select: { id: true, title: true, status: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.user_id))] } },
        select: { id: true, first_name: true, last_name: true, email: true },
      }),
    ]);
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const userById = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const c = caseById.get(r.case_id);
      const u = userById.get(r.user_id);
      return {
        ...toPromotionDto(r),
        caseTitle: c?.title ?? '',
        caseStatus: c?.status ?? 'unknown',
        ownerId: r.user_id,
        ownerName: u
          ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null
          : null,
        ownerEmail: u?.email ?? null,
        paymentId: r.payment_id,
        promoCodeId: r.promo_code_id,
        grantedBy: r.granted_by,
        cancelReason: r.cancel_reason,
      };
    });
  }
}
