import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ConfigRolloutService } from '../../common/app-settings/config-rollout.service';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
  ALL_ADMIN_ROLES,
  Roles,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';

const E = ErrorCode;

export class SettingsRolloutDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty({ description: 'Audit action of the save.' }) action!: string;
  @ApiProperty({ type: [String] }) keys!: string[];
  @ApiProperty({ type: Object, description: 'Old values (null = default).' })
  before!: Record<string, unknown>;
  @ApiProperty({ type: Object, description: 'New values.' })
  after!: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiProperty({ format: 'date-time' }) watchUntil!: string;
  @ApiProperty({ description: 'Canary share of API tasks, %.' })
  percent!: number;
}

export class SettingsRevertResultDto {
  @ApiProperty({ type: [String] }) keys!: string[];
}

export class SettingsRolloutOkDto {
  @ApiProperty() ok!: boolean;
}

/**
 * Б3 (25.11): setting changes released like code (config-rollout.ts). The
 * list of changes under watch, «Применить всем сейчас» (emergency: skips
 * the rest of the window) and «Вернуть» on a settings row of the audit log.
 * The list: every admin of the «Настройки» area; both actions: the super
 * admin only, a fresh 2FA code, an audit row.
 */
@ApiTags('admin-config')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin/settings-rollouts')
export class SettingsRolloutController {
  constructor(
    private readonly rollouts: ConfigRolloutService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Setting changes under watch (canary window)' })
  @ApiEnvelopeResponse(SettingsRolloutDto, { isArray: true })
  async listSettingsRollouts(): Promise<SettingsRolloutDto[]> {
    return (await this.rollouts.pending()).map((r) => ({
      id: r.id,
      adminId: r.adminId,
      action: r.action,
      keys: r.keys,
      before: r.before,
      after: r.after,
      startedAt: r.startedAt,
      watchUntil: r.watchUntil,
      percent: r.percent,
    }));
  }

  @Post(':id/promote')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Emergency: release a change to everyone now, skipping the watch (needs step-up)',
  })
  @ApiEnvelopeResponse(SettingsRolloutOkDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 404: [E.NOT_FOUND] })
  async promoteSettingsRollout(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SettingsRolloutOkDto> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.rollouts.promoteNow(admin.id, id, admin.ip ?? undefined);
    return { ok: true };
  }

  @Post(':id/revert')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Put the old values of a change under watch back for everyone (needs step-up)',
  })
  @ApiEnvelopeResponse(SettingsRolloutOkDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 404: [E.NOT_FOUND] })
  async revertSettingsRollout(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SettingsRolloutOkDto> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.rollouts.cancel(admin.id, id, admin.ip ?? undefined);
    return { ok: true };
  }

  @Post('changes/:auditId/revert')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revert one settings change of the audit log for everyone at once (needs step-up)',
  })
  @ApiEnvelopeResponse(SettingsRevertResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.STALE_VERSION],
  })
  async revertSettingsChange(
    @CurrentAdmin() admin: AdminActor,
    @Param('auditId', new ParseUUIDPipe()) auditId: string,
  ): Promise<SettingsRevertResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.rollouts.revertChange(admin.id, auditId, admin.ip ?? undefined);
  }
}
