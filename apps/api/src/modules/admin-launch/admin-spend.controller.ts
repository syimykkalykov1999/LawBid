import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  DEFAULT_PRICES,
  FIXED_KEY,
  PRICES_KEY,
  SpendService,
} from '../../common/ops/spend/spend.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  SpendReportDto,
  UpdateFixedCostsDto,
  UpdatePricesDto,
} from './admin-launch.dto';

const E = ErrorCode;

/**
 * Owner 2026-10-24: «Расходы» — what each outside service costs. Reads come
 * from the snapshot the daily `ops.usage-poll` job stores (Cost Explorer is
 * paid per request, so AWS is asked at most every 6 hours); the button only
 * re-asks vendors whose last try is older than 15 minutes. Prices and fixed
 * costs are edited here (2FA, audited).
 */
@ApiTags('admin-spend')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/spend')
export class AdminSpendController {
  constructor(
    private readonly spend: SpendService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Money spent per service: month, forecast, free tier',
  })
  @ApiEnvelopeResponse(SpendReportDto)
  spendReport(): Promise<SpendReportDto> {
    return this.spend.report();
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask the services again (cached: AWS at most every 6 h)',
  })
  @ApiEnvelopeResponse(SpendReportDto)
  async refreshSpend(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<SpendReportDto> {
    const r = await this.rateLimit.consumeFixedWindow(
      ['adm-spend-refresh', admin.id],
      6,
      60,
    );
    if (!r.allowed) {
      throw new HttpException(
        {
          code: E.AUTH_OTP_REQUEST_LIMIT,
          message: 'Too many requests.',
          details: { retryAfterSeconds: r.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.spend.refresh();
    return this.spend.report();
  }

  @Put('fixed-costs')
  @ApiOperation({
    summary: 'Costs entered by hand: Apple, Google, insurance… (needs step-up)',
  })
  @ApiEnvelopeResponse(SpendReportDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async setSpendFixedCosts(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateFixedCostsDto,
  ): Promise<SpendReportDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const before = await this.spend.fixedCosts();
    const items = dto.items.map((i) => ({
      id: i.id,
      label: i.label.trim(),
      usd: Math.round(i.usd * 100) / 100,
      period: i.period,
      paidMonth: i.period === 'once' ? (i.paidMonth ?? null) : null,
    }));
    await this.save(FIXED_KEY, items);
    await this.audit.record({
      adminId: admin.id,
      action: 'ops.spend_fixed_costs',
      targetType: 'app_config',
      targetId: null,
      before: { count: before.length },
      after: { count: items.length },
      ip: admin.ip,
    });
    return this.spend.report();
  }

  @Put('prices')
  @ApiOperation({
    summary: 'Vendor prices used for the estimate (needs step-up)',
  })
  @ApiEnvelopeResponse(SpendReportDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async setSpendPrices(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdatePricesDto,
  ): Promise<SpendReportDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const known = new Map(DEFAULT_PRICES.map((d) => [d.key, d]));
    const today = new Date().toISOString().slice(0, 10);
    const saved: Record<string, { value: number; checkedAt: string }> = {};
    for (const p of await this.spend.prices()) {
      if (p.edited) saved[p.key] = { value: p.value, checkedAt: p.checkedAt };
    }
    for (const [key, value] of Object.entries(dto.values)) {
      const def = known.get(key);
      if (
        !def ||
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1e9
      ) {
        continue;
      }
      if (value === def.value) delete saved[key];
      else saved[key] = { value, checkedAt: today };
    }
    await this.save(PRICES_KEY, saved);
    await this.audit.record({
      adminId: admin.id,
      action: 'ops.spend_prices',
      targetType: 'app_config',
      targetId: null,
      before: null,
      after: Object.fromEntries(
        Object.entries(saved).map(([k, v]) => [k, v.value]),
      ),
      ip: admin.ip,
    });
    return this.spend.report();
  }

  private async save(key: string, value: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
