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
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import { AwsOpsService } from '../../common/ops/aws-ops.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { StatusProbesService } from '../../common/ops/status/status-probes.service';
import { MessageReencryptJob } from '../../jobs/handlers/message-reencrypt.job';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  CallsPathDto,
  HeavyJobsDto,
  QueueRetryResultDto,
  ScaleDto,
  ScaleExtrasDto,
  SystemHealthDto,
  UpdateOpsSettingsDto,
} from './admin-ops.dto';
import { QueueAdminService } from './queue-admin.service';
import { ScaleService } from './scale.service';
import { SystemHealthService } from './system-health.service';

const E = ErrorCode;

/**
 * Owner 2026-10-05: Система → «Здоровье системы» (super_admin only). The
 * traffic lights, the automatic-reaction switches and the few buttons an
 * owner may need. Buttons that touch AWS (restart, scale) need a fresh
 * 2FA code; every action is audited.
 */
@ApiTags('admin-ops')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/system-health')
export class AdminOpsController {
  constructor(
    private readonly health: SystemHealthService,
    private readonly state: OpsStateService,
    private readonly aws: AwsOpsService,
    private readonly writer: AppSettingsWriter,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly reencrypt: MessageReencryptJob,
    private readonly scale: ScaleService,
    private readonly probes: StatusProbesService,
    private readonly queues: QueueAdminService,
  ) {}

  // Owner 2026-10-26 (calls failover): Integrations -> «Связь для звонков».
  @Get('calls-path')
  @ApiOperation({
    summary:
      'Calls transport: who carries calls now, breakers, last probe (no outside request)',
  })
  @ApiEnvelopeResponse(CallsPathDto)
  getCallsPath(): Promise<CallsPathDto> {
    return this.probes.callsPath(false);
  }

  @Post('calls-path/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run the synthetic STUN + TURN allocate test on Cloudflare and on our own relays now',
  })
  @ApiEnvelopeResponse(CallsPathDto)
  checkCallsPath(): Promise<CallsPathDto> {
    return this.probes.callsPath(true);
  }

  @Get()
  @ApiOperation({ summary: 'Traffic lights of every part of the system' })
  @ApiEnvelopeResponse(SystemHealthDto)
  getSystemHealth(): Promise<SystemHealthDto> {
    return this.health.report();
  }

  @Get('scale')
  @ApiOperation({
    summary: 'Scale page extras: autoscale switches, pooler, search engine',
  })
  @ApiEnvelopeResponse(ScaleExtrasDto)
  getScaleExtras(): Promise<ScaleExtrasDto> {
    return this.scale.report();
  }

  @Post('restart-worker')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace the background worker (needs step-up)' })
  @ApiEnvelopeResponse(SystemHealthDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async restartOpsWorker(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<SystemHealthDto> {
    await this.auth.assertStepUp(admin.sessionId);
    this.requireAws();
    await this.aws.restartWorker();
    await this.log(admin, 'ops.restart_worker', null);
    return this.health.report();
  }

  @Post('message-reencrypt/restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start a new message re-encryption pass (needs step-up)',
  })
  @ApiEnvelopeResponse(SystemHealthDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async restartMessageReencrypt(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<SystemHealthDto> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.reencrypt.restart();
    await this.log(admin, 'ops.message_reencrypt_restart', null);
    return this.health.report();
  }

  @Post('queues/retry-failed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Retry failed background jobs and replay Stripe dead letters (needs step-up)',
  })
  @ApiEnvelopeResponse(QueueRetryResultDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async retryFailedJobs(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<QueueRetryResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    const result = await this.queues.retryFailed();
    await this.log(admin, 'ops.queues_retry_failed', {
      retried: String(result.retried),
      stripeReplayed: String(result.stripeReplayed),
    });
    return result;
  }

  @Post('heavy-jobs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause / resume heavy background jobs' })
  @ApiEnvelopeResponse(SystemHealthDto)
  async setHeavyJobsPaused(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: HeavyJobsDto,
  ): Promise<SystemHealthDto> {
    await this.state.setHeavyPaused(dto.paused, 'owner', 'owner button');
    await this.log(admin, 'ops.heavy_jobs', { paused: dto.paused });
    return this.health.report();
  }

  @Post('scale')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cap autoscaling at the minimum / back to normal (needs step-up)',
  })
  @ApiEnvelopeResponse(SystemHealthDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  async setOpsScale(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: ScaleDto,
  ): Promise<SystemHealthDto> {
    await this.auth.assertStepUp(admin.sessionId);
    this.requireAws();
    await this.aws.setScale(dto.mode);
    await this.state.setScaleMode({
      mode: dto.mode,
      by: 'owner',
      at: new Date().toISOString(),
    });
    await this.log(admin, 'ops.scale', { mode: dto.mode });
    return this.health.report();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Switch the automatic reactions on / off' })
  @ApiEnvelopeResponse(SystemHealthDto)
  async updateOpsSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateOpsSettingsDto,
  ): Promise<SystemHealthDto> {
    await this.writer.write(admin.id, 'ops.settings', {
      'ops.auto_pause_heavy_jobs': dto.autoPauseHeavyJobs,
      'ops.auto_scale_down_on_budget': dto.autoScaleDownOnBudget,
    });
    return this.health.report();
  }

  private requireAws(): void {
    if (!this.aws.available) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message: 'This button works only on AWS (production / staging).',
        },
        HttpStatus.CONFLICT,
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
