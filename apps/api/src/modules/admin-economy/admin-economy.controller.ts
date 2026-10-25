import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import {
  ECONOMY_FLAG,
  EconomyService,
} from '../../common/economy/economy.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AwsCapacityService } from '../../common/ops/aws-capacity.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import { AdminConfigService } from '../admin-config/admin-config.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  EconomyReportDto,
  IncreaseCapacityDto,
  UpdateEconomyDto,
} from './admin-economy.dto';

const E = ErrorCode;

/**
 * Owner 2026-10-16: Система → «Экономика» (super admin only): revenue vs
 * third-party spend, the rule, the container ceiling and the database /
 * Redis tiers. Raising a tier needs a fresh 2FA code; every change is
 * audited.
 */
@ApiTags('admin-economy')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/economy')
export class AdminEconomyController {
  constructor(
    private readonly economy: EconomyService,
    private readonly capacity: AwsCapacityService,
    private readonly writer: AppSettingsWriter,
    private readonly config: AdminConfigService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Revenue vs third-party spend, ceiling, tiers' })
  @ApiEnvelopeResponse(EconomyReportDto)
  getEconomy(): Promise<EconomyReportDto> {
    return this.economy.report();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'The spend rule, ceiling mode, unit prices, flag' })
  @ApiEnvelopeResponse(EconomyReportDto)
  async updateEconomySettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateEconomyDto,
  ): Promise<EconomyReportDto> {
    await this.writer.write(admin.id, 'economy.settings', {
      'economy.max_spend_percent': dto.percent,
      'economy.min_threshold_usd': dto.thresholdUsd,
      'economy.ceiling_mode': dto.ceilingMode,
      'economy.manual_api_max': dto.manualApi,
      'economy.manual_worker_max': dto.manualWorker,
      'economy.sms_unit_usd': dto.smsUnitUsd,
      'economy.video_unit_usd': dto.videoUnitUsd,
      'economy.translate_unit_usd': dto.translateUnitUsd,
      'economy.aws_fallback_usd': dto.awsFallbackUsd,
    });
    if (dto.guardEnabled !== undefined) {
      await this.config.updateFlag(admin, ECONOMY_FLAG, {
        enabled: dto.guardEnabled,
      });
    }
    // Apply now (rule, ceiling, rollback) instead of waiting for the tick.
    await this.economy.tick().catch(() => undefined);
    return this.economy.report();
  }

  @Post('increase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Database or Redis one tier up (needs step-up)',
  })
  @ApiEnvelopeResponse(EconomyReportDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async increaseCapacity(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: IncreaseCapacityDto,
  ): Promise<EconomyReportDto> {
    await this.auth.assertStepUp(admin.sessionId);
    if (!this.capacity.available) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message: 'This button works only on AWS (production / staging).',
        },
        HttpStatus.CONFLICT,
      );
    }
    const res = await this.economy.increase(dto.target);
    if (!res) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message: 'There is no bigger tier (or the current one is unknown).',
        },
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.record({
      adminId: admin.id,
      action: 'economy.increase',
      targetType: 'system',
      targetId: null,
      before: { target: dto.target, tier: res.from },
      after: { target: dto.target, tier: res.to },
      ip: admin.ip,
    });
    return this.economy.report();
  }

  @Post('decrease')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Database or Redis one tier down, only when the load is low (needs step-up)',
  })
  @ApiEnvelopeResponse(EconomyReportDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async decreaseCapacity(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: IncreaseCapacityDto,
  ): Promise<EconomyReportDto> {
    await this.auth.assertStepUp(admin.sessionId);
    if (!this.capacity.available) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message: 'This button works only on AWS (production / staging).',
        },
        HttpStatus.CONFLICT,
      );
    }
    const res = await this.economy.decrease(dto.target);
    if (!res.ok) {
      throw new HttpException(
        { code: E.FEATURE_DISABLED, message: res.text },
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.record({
      adminId: admin.id,
      action: 'economy.decrease',
      targetType: 'system',
      targetId: null,
      before: { target: dto.target, tier: res.from },
      after: { target: dto.target, tier: res.to },
      ip: admin.ip,
    });
    return this.economy.report();
  }
}
