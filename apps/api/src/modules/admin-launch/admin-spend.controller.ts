import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { boardEtag, notModified } from '../../common/sync/cheap-etag';
import type { Prisma } from '../../generated/prisma/client';
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
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  AUTOSCALE_TUNING_SCHEMA,
  validateAutoscaleTuning,
  type AutoscaleTarget,
} from '../../common/ops/autoscale-tuning';
import { SsmParamGateway } from '../../common/ops/ssm-param.gateway';
import {
  AutoscaleTuningReportDto,
  UpdateAutoscaleTuningDto,
  CostModeResultDto,
  CostRegistryReportDto,
  SetCostModeDto,
  SpendReportDto,
  UpdateFixedCostsDto,
  UpdatePricesDto,
} from './admin-launch.dto';
import {
  CostRegistryService,
  RegistryModeError,
} from './cost-registry.service';

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
    private readonly registry: CostRegistryService,
    private readonly ssm: SsmParamGateway,
  ) {}

  /** Owner 14.11: every number of the Redis / database «Авто» (Lambda
   * autoscalers) with its Russian label, bounds and the admin's value
   * (null = the Terraform default). */
  @Get('autoscale-tuning')
  @ApiOperation({
    summary: 'Autoscaler numbers (SSM tuning) with labels and bounds',
  })
  @ApiEnvelopeResponse(AutoscaleTuningReportDto)
  async autoscaleTuning(): Promise<AutoscaleTuningReportDto> {
    const targets = await Promise.all(
      (['redis', 'db'] as const).map(async (target) => {
        const available = !!this.ssm.tuningParam(target);
        const stored = available
          ? ((await this.ssm.getTuning(target).catch(() => null)) ?? {})
          : {};
        return {
          target,
          available,
          knobs: Object.entries(AUTOSCALE_TUNING_SCHEMA[target]).map(
            ([key, k]) => ({
              key,
              ...k,
              value: typeof stored[key] === 'number' ? stored[key] : null,
            }),
          ),
        };
      }),
    );
    return { targets };
  }

  /** Owner 14.11: change the numbers without a Terraform apply. Fresh 2FA;
   * merged into what is stored (null = back to the default); audited. */
  @Put('autoscale-tuning/:target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change autoscaler numbers (needs step-up)' })
  @ApiEnvelopeResponse(AutoscaleTuningReportDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.FEATURE_DISABLED],
  })
  async updateAutoscaleTuning(
    @CurrentAdmin() admin: AdminActor,
    @Param('target') target: string,
    @Body() dto: UpdateAutoscaleTuningDto,
  ): Promise<AutoscaleTuningReportDto> {
    if (target !== 'db' && target !== 'redis') {
      throw new HttpException(
        { code: E.VALIDATION_ERROR, message: 'target: db or redis.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const t: AutoscaleTarget = target;
    await this.auth.assertStepUp(admin.sessionId);
    if (!this.ssm.tuningParam(t)) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message: 'This autoscaler is not on this server.',
        },
        HttpStatus.CONFLICT,
      );
    }
    const check = validateAutoscaleTuning(t, dto.values ?? {});
    if (!check.ok) {
      throw new HttpException(
        {
          code: E.VALIDATION_ERROR,
          message: `Out of bounds: ${check.errors.join('; ')}.`,
          details: { errors: check.errors },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const before = (await this.ssm.getTuning(t)) ?? {};
    const next: Record<string, number> = { ...before, ...check.values };
    for (const [k, v] of Object.entries(dto.values ?? {})) {
      if (v === null) delete next[k];
    }
    await this.ssm.setTuning(t, next);
    await this.audit.record({
      adminId: admin.id,
      action: 'ops.autoscale_tuning',
      targetType: 'autoscaler',
      targetId: null,
      before: { target: t, values: before },
      after: { target: t, values: next },
      ip: admin.ip,
    });
    return this.autoscaleTuning();
  }

  /**
   * Cost registry (owner 2026-10-25): every billable thing with this
   * month's real number and the live position of its switch.
   */
  @Get('registry')
  @ApiOperation({
    summary:
      'Every billable item: real month cost, forecast, live Выкл/Вкл/Авто state, steps',
  })
  @ApiEnvelopeResponse(CostRegistryReportDto)
  async registryReport(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CostRegistryReportDto | undefined> {
    // R-370: the shared copy (≤ 60 s old, refreshed in the background).
    // 12.11: 185 KB; every rebuild stamped generatedAt and each row's
    // status.checkedAt, so it never answered 304 (cheap-etag boardEtag).
    const report = await this.registry.cachedReport();
    if (notModified(req, res, boardEtag(report))) return undefined;
    return report;
  }

  @Patch('registry/:id/mode')
  @ApiOperation({
    summary:
      'Put one item in Выкл / Вкл / Авто (app settings and autoscale switches; needs step-up)',
  })
  @ApiEnvelopeResponse(CostModeResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  async setRegistryMode(
    @CurrentAdmin() admin: AdminActor,
    @Param('id') id: string,
    @Body() dto: SetCostModeDto,
  ): Promise<CostModeResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    try {
      const done = await this.registry.setMode(
        admin.id,
        admin.ip,
        id,
        dto.state,
      );
      // R-370: the page re-reads the registry right after this answer, so
      // the shared copy is replaced first (a failed rebuild only means the
      // old copy is shown until the next refresh).
      await this.registry.report().catch(() => undefined);
      return done;
    } catch (e) {
      if (e instanceof RegistryModeError) {
        const status =
          e.code === 'unknown_item'
            ? HttpStatus.NOT_FOUND
            : e.code === 'bad_state'
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.CONFLICT;
        throw new HttpException(
          {
            code:
              e.code === 'unknown_item'
                ? E.NOT_FOUND
                : e.code === 'bad_state'
                  ? E.VALIDATION_ERROR
                  : E.FEATURE_DISABLED,
            message: e.message,
          },
          status,
        );
      }
      throw e;
    }
  }

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
  async refreshSpend(): Promise<SpendReportDto> {
    // Owner 2026-11-12: no per-minute cap on his own button; AWS is still
    // asked at most every 6 h (SpendService caches it).
    await this.spend.refresh();
    // R-370: the registry copy carries these numbers too.
    void this.registry.report().catch(() => undefined);
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
    // R-370: the registry copy carries these numbers too.
    void this.registry.report().catch(() => undefined);
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
    // R-370: the registry copy carries these numbers too.
    void this.registry.report().catch(() => undefined);
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
