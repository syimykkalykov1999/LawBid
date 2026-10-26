import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AwsBudgetsAdminService,
  PagerDutySnsService,
} from '../../common/ops/launch/aws-launch.service';
import { LaunchChecksService } from '../../common/ops/launch/launch-checks.service';
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
  AwsBudgetsDto,
  BudgetDeleteRequestDto,
  BudgetLimitRequestDto,
  LaunchReportDto,
  LaunchTickDto,
  LaunchTickParamDto,
  PagingStatusDto,
  RestoreDrillDto,
} from './admin-launch.dto';

const E = ErrorCode;

/**
 * Owner 2026-10-24: «Запуск» (the launch checklist), the PagerDuty
 * subscription and the AWS budgets on «Масштаб». super_admin only. Reads are
 * cached in the services; every change needs a fresh 2FA code and is
 * audited (no second admin: the owner works alone).
 */
@ApiTags('admin-launch')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/launch')
export class AdminLaunchController {
  constructor(
    private readonly checks: LaunchChecksService,
    private readonly paging: PagerDutySnsService,
    private readonly budgets: AwsBudgetsAdminService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private async applyLimit(who: AdminActor, p: BudgetLimitRequestDto) {
    await this.budgets.setLimit(p.name, p.limitUsd);
    await this.log(who, 'ops.budget_limit', {
      name: p.name,
      limitUsd: p.limitUsd,
    });
    this.checks.invalidate();
    return { name: p.name, limitUsd: p.limitUsd };
  }

  private async applyDelete(who: AdminActor, p: BudgetDeleteRequestDto) {
    await this.budgets.remove(p.name);
    await this.log(who, 'ops.budget_delete', { name: p.name });
    this.checks.invalidate();
    return { name: p.name };
  }

  @Get()
  @ApiOperation({ summary: 'The launch checklist with live lights' })
  @ApiEnvelopeResponse(LaunchReportDto)
  launchReport(): Promise<LaunchReportDto> {
    return this.checks.report();
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check everything again now (at most 6 a minute)' })
  @ApiEnvelopeResponse(LaunchReportDto)
  async refreshLaunch(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<LaunchReportDto> {
    await this.limit(['adm-launch-refresh', admin.id], 6, 60);
    return this.checks.report(new Date(), true);
  }

  @Post('ticks/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tick / untick a step nothing can detect' })
  @ApiEnvelopeResponse(LaunchReportDto)
  async tickLaunchItem(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: LaunchTickParamDto,
    @Body() dto: LaunchTickDto,
  ): Promise<LaunchReportDto> {
    await this.checks.setTick(p.id, dto.done);
    await this.log(admin, 'ops.launch_tick', { id: p.id, done: dto.done });
    return this.checks.report();
  }

  @Post('restore-drill')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record that the restore drill was done today (needs step-up)',
  })
  @ApiEnvelopeResponse(LaunchReportDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async recordRestoreDrill(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: RestoreDrillDto,
  ): Promise<LaunchReportDto> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.checks.recordDrill(dto.note?.trim() || null);
    await this.log(admin, 'ops.restore_drill', { note: dto.note ?? null });
    return this.checks.report();
  }

  // --- PagerDuty ---------------------------------------------------------

  @Get('pagerduty')
  @ApiOperation({
    summary: 'PagerDuty subscription state on the critical topic',
  })
  @ApiEnvelopeResponse(PagingStatusDto)
  getPagingStatus(): Promise<PagingStatusDto> {
    return this.paging.status(true);
  }

  @Post('pagerduty/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Subscribe the saved PagerDuty link, drop the old one (needs step-up)',
  })
  @ApiEnvelopeResponse(PagingStatusDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async syncPaging(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<PagingStatusDto> {
    await this.auth.assertStepUp(admin.sessionId);
    this.requireTopic();
    const s = await this.paging.sync();
    this.checks.invalidate();
    await this.log(admin, 'ops.pagerduty_sync', { state: s.state });
    return s;
  }

  @Post('pagerduty/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Publish a test alarm to the critical topic: the phone will ring (needs step-up)',
  })
  @ApiEnvelopeResponse(PagingStatusDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async testPaging(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<PagingStatusDto> {
    await this.auth.assertStepUp(admin.sessionId);
    this.requireTopic();
    // Each test is one of the 100 free calls a month.
    await this.limit(['adm-paging-test', admin.id], 3, 3600);
    await this.paging.publishTest();
    await this.log(admin, 'ops.pagerduty_test', null);
    return this.paging.status(true);
  }

  // --- AWS Budgets ---------------------------------------------------------

  @Get('budgets')
  @ApiOperation({ summary: 'Every AWS budget of the account' })
  @ApiEnvelopeResponse(AwsBudgetsDto)
  async listAwsBudgets(): Promise<AwsBudgetsDto> {
    if (!this.budgets.available) return { available: false, items: [] };
    return { available: true, items: await this.budgets.list(true) };
  }

  @Post('budgets/limit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change the monthly limit of the prod budget (fresh 2FA step-up)',
  })
  @ApiEnvelopeResponse(AwsBudgetsDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.FEATURE_DISABLED],
  })
  async setAwsBudgetLimit(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: BudgetLimitRequestDto,
  ): Promise<AwsBudgetsDto> {
    await this.auth.assertStepUp(admin.sessionId);
    this.requireBudgets();
    if (dto.name !== this.budgets.prodName) {
      throw new BadRequestException({
        code: E.VALIDATION_ERROR,
        message: 'Only the production budget limit can be changed here.',
      });
    }
    await this.applyLimit(admin, dto);
    return this.listAwsBudgets();
  }

  @Post('budgets/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete the obsolete «LawBid Monthly» budget (fresh 2FA step-up)',
  })
  @ApiEnvelopeResponse(AwsBudgetsDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.FEATURE_DISABLED],
  })
  async deleteAwsBudget(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: BudgetDeleteRequestDto,
  ): Promise<AwsBudgetsDto> {
    await this.auth.assertStepUp(admin.sessionId);
    this.requireBudgets();
    if (
      dto.name !== this.budgets.obsoleteName ||
      dto.name === this.budgets.prodName
    ) {
      throw new BadRequestException({
        code: E.VALIDATION_ERROR,
        message: 'Only the obsolete budget can be deleted here.',
      });
    }
    await this.applyDelete(admin, dto);
    return this.listAwsBudgets();
  }

  // ---------------------------------------------------------------------

  private requireTopic(): void {
    if (!this.paging.available) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message: 'This works only on AWS (production).',
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  private requireBudgets(): void {
    if (!this.budgets.available) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message: 'This works only on AWS (production).',
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  private async limit(parts: string[], max: number, windowSec: number) {
    const r = await this.rateLimit.consumeFixedWindow(parts, max, windowSec);
    if (!r.allowed) {
      throw new HttpException(
        {
          code: E.AUTH_OTP_REQUEST_LIMIT,
          message: 'Too many requests. Try again later.',
          details: { retryAfterSeconds: r.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private log(
    admin: AdminActor,
    action: string,
    after: Record<string, unknown> | null,
  ) {
    return this.audit.record({
      adminId: admin.id,
      action,
      targetType: 'system',
      targetId: null,
      before: null,
      after: after as Record<string, string> | null,
      ip: admin.ip,
    });
  }
}
