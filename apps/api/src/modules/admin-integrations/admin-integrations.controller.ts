import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { SecretsService } from '../../common/secrets/secrets.service';
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
  ActivateIntegrationDto,
  CreateIntegrationVersionDto,
  IntegrationsOverviewDto,
  IntegrationVersionDto,
  ProviderParamDto,
  RemoveIntegrationDto,
  VersionParamDto,
} from './admin-integrations.dto';

const E = ErrorCode;

/**
 * Owner 2026-10-01 — Admin → "Integrations & API keys" (super_admin only).
 * Values are write-only (the API never returns a secret); every change
 * needs a fresh 2FA code (POST /admin/auth/step-up) and is audited with
 * masked values only. New keys go live only after "Test" + "Activate".
 */
@ApiTags('admin-integrations')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/integrations')
export class AdminIntegrationsController {
  constructor(
    private readonly secrets: SecretsService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every integration: source, masked keys, tests' })
  @ApiEnvelopeResponse(IntegrationsOverviewDto)
  async listIntegrations(): Promise<IntegrationsOverviewDto> {
    return {
      storageEnabled: this.secrets.enabled,
      items: await this.secrets.overview(),
    };
  }

  @Get(':provider/versions')
  @ApiOperation({ summary: 'Versions of one integration (masked)' })
  @ApiEnvelopeResponse(IntegrationVersionDto, { isArray: true })
  listIntegrationVersions(
    @Param() p: ProviderParamDto,
  ): Promise<IntegrationVersionDto[]> {
    return this.secrets.versions(p.provider);
  }

  @Post(':provider/versions')
  @ApiOperation({
    summary: 'Save new keys as a pending version (needs step-up)',
  })
  @ApiEnvelopeResponse(IntegrationVersionDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    503: [E.INTEGRATIONS_NOT_CONFIGURED],
  })
  async createIntegrationVersion(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ProviderParamDto,
    @Body() dto: CreateIntegrationVersionDto,
  ): Promise<IntegrationVersionDto> {
    await this.guard(admin);
    const v = await this.secrets.createVersion(
      p.provider,
      stringValues(dto.values),
      admin.id,
    );
    await this.log(admin, 'integration.create_version', p.provider, v);
    return v;
  }

  @Post(':provider/versions/:version/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test connection with this version' })
  @ApiEnvelopeResponse(IntegrationVersionDto)
  async testIntegrationVersion(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: VersionParamDto,
  ): Promise<IntegrationVersionDto> {
    await this.limit(['adm-int-test', p.provider], 10, 60);
    const v = await this.secrets.test(p.provider, p.version);
    await this.log(admin, 'integration.test', p.provider, {
      version: v.version,
      ok: v.lastTestOk,
    });
    return v;
  }

  @Post(':provider/versions/:version/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make this version live (needs step-up)' })
  @ApiEnvelopeResponse(IntegrationVersionDto)
  @ApiErrors({ 409: [E.INTEGRATION_CONFLICT] })
  async activateIntegrationVersion(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: VersionParamDto,
    @Body() dto: ActivateIntegrationDto,
  ): Promise<IntegrationVersionDto> {
    await this.guard(admin);
    const v = await this.secrets.activate(
      p.provider,
      p.version,
      dto.force ?? false,
    );
    await this.log(admin, 'integration.activate', p.provider, {
      ...v,
      forced: dto.force ?? false,
    });
    return v;
  }

  @Post(':provider/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Back to the previous version (needs step-up)' })
  @ApiEnvelopeResponse(IntegrationVersionDto)
  async rollbackIntegration(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ProviderParamDto,
  ): Promise<IntegrationVersionDto> {
    await this.guard(admin);
    const v = await this.secrets.rollback(p.provider);
    await this.log(admin, 'integration.rollback', p.provider, v);
    return v;
  }

  @Delete(':provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Stop using the keys saved here (back to the server env)',
  })
  async removeIntegration(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ProviderParamDto,
    @Body() dto: RemoveIntegrationDto,
  ): Promise<void> {
    if (dto.confirm !== p.provider) {
      throw new BadRequestException({
        code: E.VALIDATION_ERROR,
        message: 'Type the integration id to confirm.',
      });
    }
    await this.guard(admin);
    await this.secrets.remove(p.provider);
    await this.log(admin, 'integration.delete', p.provider, null);
  }

  @Post('reencrypt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-encrypt every key under the active master key',
  })
  async reencryptIntegrations(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<{ reencrypted: number }> {
    await this.guard(admin);
    const n = await this.secrets.reencrypt();
    await this.log(admin, 'integration.reencrypt', 'all', { reencrypted: n });
    return { reencrypted: n };
  }

  /** A fresh 2FA code + at most 20 key changes an hour per admin. */
  private async guard(admin: AdminActor) {
    await this.auth.assertStepUp(admin.sessionId);
    await this.limit(['adm-int-write', admin.id], 20, 3600);
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

  /** Masked values, version and fingerprint only — never a secret. */
  private log(
    admin: AdminActor,
    action: string,
    provider: string,
    after: object | null,
  ) {
    return this.audit.record({
      adminId: admin.id,
      action,
      targetType: 'integration',
      targetId: null,
      before: { provider },
      after: after
        ? (JSON.parse(JSON.stringify({ provider, ...after })) as Record<
            string,
            string
          >)
        : null,
      ip: admin.ip,
    });
  }
}

function stringValues(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === 'string' && k.length <= 60) out[k] = v.slice(0, 8000);
  }
  return out;
}
