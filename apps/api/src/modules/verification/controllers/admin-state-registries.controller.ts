import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AuditLogService } from '../../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../../admin-auth/admin-auth.service';
import { RateLimitService } from '../../auth/services/rate-limit.service';
import {
  CopyStateRegistryDto,
  CopyStateRegistryResultDto,
  RegistryTestResultDto,
  SaveStateRegistryDto,
  StateCodeParamDto,
  StateRegistriesOverviewDto,
  StateRegistryDto,
  TestStateRegistryDto,
} from '../dto/state-registries.dto';
import { StateRegistryService } from '../services/state-registry.service';

const E = ErrorCode;

/**
 * Owner 2026-10-05 — Admin → Ключи и сервисы → "Реестры адвокатов по
 * штатам" (super_admin): per state, the adapter, its settings and API
 * key, on/off and a test lookup. Saving needs a fresh 2FA code (keys) and
 * is audited without the key; the key is never returned.
 */
@ApiTags('admin-verification')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/verification/registries')
export class AdminStateRegistriesController {
  constructor(
    private readonly registries: StateRegistryService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every state with its registry settings' })
  @ApiEnvelopeResponse(StateRegistriesOverviewDto)
  listStateRegistries(): Promise<StateRegistriesOverviewDto> {
    return this.registries.list();
  }

  @Put(':stateCode')
  @ApiOperation({ summary: "Save a state's registry (needs step-up)" })
  @ApiEnvelopeResponse(StateRegistryDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    503: [E.INTEGRATIONS_NOT_CONFIGURED],
  })
  async saveStateRegistry(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StateCodeParamDto,
    @Body() dto: SaveStateRegistryDto,
  ): Promise<StateRegistryDto> {
    await this.guard(admin);
    const saved = await this.registries.save(p.stateCode, dto, admin.id);
    await this.log(admin, 'verification.registry_save', p.stateCode, {
      adapter: saved.adapter,
      enabled: saved.enabled,
      config: saved.config,
      secret: saved.secretMasked,
    });
    return saved;
  }

  @Post(':stateCode/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up a sample bar number with the saved settings',
  })
  @ApiEnvelopeResponse(RegistryTestResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async testStateRegistry(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StateCodeParamDto,
    @Body() dto: TestStateRegistryDto,
  ): Promise<RegistryTestResultDto> {
    await this.limit(['adm-reg-test', admin.id], 20, 60);
    const out = await this.registries.test(p.stateCode, dto);
    await this.log(admin, 'verification.registry_test', p.stateCode, {
      result: out.result,
    });
    return out;
  }

  @Post(':stateCode/copy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Copy a state's registry and key to other states (needs step-up)",
  })
  @ApiEnvelopeResponse(CopyStateRegistryResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
  })
  async copyStateRegistry(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StateCodeParamDto,
    @Body() dto: CopyStateRegistryDto,
  ): Promise<CopyStateRegistryResultDto> {
    await this.guard(admin);
    const out = await this.registries.copy(p.stateCode, dto.states, admin.id);
    await this.log(admin, 'verification.registry_copy', p.stateCode, out);
    return out;
  }

  /** A fresh 2FA code + at most 60 changes an hour per admin. */
  private async guard(admin: AdminActor) {
    await this.auth.assertStepUp(admin.sessionId);
    await this.limit(['adm-reg-write', admin.id], 60, 3600);
  }

  private async limit(parts: string[], max: number, windowSec: number) {
    const r = await this.rateLimit.consumeFixedWindow(parts, max, windowSec);
    if (!r.allowed) {
      throw new HttpException(
        {
          code: E.AUTH_OTP_REQUEST_LIMIT,
          message: 'Too many changes. Try again later.',
          details: { retryAfterSeconds: r.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private log(
    admin: AdminActor,
    action: string,
    stateCode: string,
    after: object,
  ) {
    return this.audit.record({
      adminId: admin.id,
      action,
      targetType: 'state_bar_registry',
      targetId: null,
      before: { stateCode },
      after: JSON.parse(JSON.stringify({ stateCode, ...after })) as Record<
        string,
        string
      >,
      ip: admin.ip,
    });
  }
}
