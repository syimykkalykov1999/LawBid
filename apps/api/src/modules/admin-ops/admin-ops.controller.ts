import {
  Param,
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
import { MessageReencryptJob } from '../../jobs/handlers/message-reencrypt.job';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { PartitionService } from '../../partitioning/partition.service';
import { ReplicaAdminService } from '../../prisma/replica-admin.service';
import {
  HeavyJobsDto,
  PartitionCardDto,
  PartitionPauseDto,
  PartitionTableParamDto,
  ReplicaStatusDto,
  ReplicaToggleDto,
  ScaleDto,
  ScaleExtrasDto,
  SystemHealthDto,
  UpdateOpsSettingsDto,
} from './admin-ops.dto';
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
    private readonly partitions: PartitionService,
    private readonly replica: ReplicaAdminService,
  ) {}

  @Get('db-replica')
  @ApiOperation({ summary: 'Read copy of the database: state, lag' })
  @ApiEnvelopeResponse(ReplicaStatusDto)
  getReplica(): Promise<ReplicaStatusDto> {
    return this.replica.status();
  }

  @Post('db-replica')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create / delete the read copy (step-up)',
  })
  @ApiEnvelopeResponse(ReplicaStatusDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    409: [E.FEATURE_DISABLED],
  })
  async setReplica(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: ReplicaToggleDto,
  ): Promise<ReplicaStatusDto> {
    await this.auth.assertStepUp(admin.sessionId);
    if (!this.replica.available) {
      throw new HttpException(
        {
          code: E.FEATURE_DISABLED,
          message:
            'Работает только на AWS после включения db_replica_toggle в Terraform.',
        },
        HttpStatus.CONFLICT,
      );
    }
    if (dto.enabled) await this.replica.enable();
    else await this.replica.disable();
    await this.log(admin, 'ops.db_replica', { enabled: dto.enabled });
    return this.replica.status();
  }

  @Get('partitions')
  @ApiOperation({ summary: 'Tables and their monthly partitioning state' })
  @ApiEnvelopeResponse(PartitionCardDto, { isArray: true })
  getPartitions(): Promise<PartitionCardDto[]> {
    return this.partitions.report();
  }

  @Post('partitions/:table/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Start the online conversion of a table to monthly partitions (step-up)',
  })
  @ApiEnvelopeResponse(PartitionCardDto, { isArray: true })
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
  })
  async startPartition(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PartitionTableParamDto,
  ): Promise<PartitionCardDto[]> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.partitions.start(p.table, admin.id);
    await this.log(admin, 'ops.partition_start', { table: p.table });
    return this.partitions.report();
  }

  @Post('partitions/:table/undo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Swap the old table back (step-up)' })
  @ApiEnvelopeResponse(PartitionCardDto, { isArray: true })
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
  })
  async undoPartition(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PartitionTableParamDto,
  ): Promise<PartitionCardDto[]> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.partitions.undo(p.table);
    await this.log(admin, 'ops.partition_undo', { table: p.table });
    return this.partitions.report();
  }

  @Post('partitions/:table/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete the old copy for good (step-up)',
  })
  @ApiEnvelopeResponse(PartitionCardDto, { isArray: true })
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
  })
  async finalizePartition(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PartitionTableParamDto,
  ): Promise<PartitionCardDto[]> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.partitions.finalize(p.table);
    await this.log(admin, 'ops.partition_finalize', { table: p.table });
    return this.partitions.report();
  }

  @Post('partitions/:table/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause / resume a running conversion (step-up)' })
  @ApiEnvelopeResponse(PartitionCardDto, { isArray: true })
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async pausePartition(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PartitionTableParamDto,
    @Body() dto: PartitionPauseDto,
  ): Promise<PartitionCardDto[]> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.partitions.pause(p.table, dto.paused);
    await this.log(admin, 'ops.partition_pause', {
      table: p.table,
      paused: dto.paused,
    });
    return this.partitions.report();
  }

  @Post('partitions/:table/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Try a failed step again (step-up)' })
  @ApiEnvelopeResponse(PartitionCardDto, { isArray: true })
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async retryPartition(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PartitionTableParamDto,
  ): Promise<PartitionCardDto[]> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.partitions.retry(p.table);
    await this.log(admin, 'ops.partition_retry', { table: p.table });
    return this.partitions.report();
  }

  @Post('partitions/:table/abort')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Stop before the swap: drop the copy, nothing was changed (step-up)',
  })
  @ApiEnvelopeResponse(PartitionCardDto, { isArray: true })
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async abortPartition(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PartitionTableParamDto,
  ): Promise<PartitionCardDto[]> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.partitions.abort(p.table);
    await this.log(admin, 'ops.partition_abort', { table: p.table });
    return this.partitions.report();
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
