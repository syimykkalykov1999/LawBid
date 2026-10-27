import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { COST_REGISTRY } from '../../../common/ops/cost-registry';
import { INFRA_SWITCHES, switchFor } from '../../../common/ops/infra-switches';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../../admin-auth/admin-auth.service';
import { CostRegistryService } from '../cost-registry.service';
import { costDelta } from './infra-change.logic';
import { InfraChangeService } from './infra-change.service';
import { infraHttp } from './infra-errors';
import {
  CreateInfraRequestDto,
  InfraOverviewDto,
  InfraRequestDto,
} from './infra.dto';

const E = ErrorCode;

/**
 * Owner 2026-10-26: infra switches from the admin. Выкл / Вкл on a
 * Terraform row of «Расходы» / «Масштаб» creates a request; GitHub plans it;
 * the owner confirms the plan with a fresh 2FA code (no second admin);
 * GitHub applies exactly that plan. docs/runbooks/infra-from-admin.md.
 */
@ApiTags('admin-infra')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/infra')
export class AdminInfraController {
  constructor(
    private readonly infra: InfraChangeService,
    private readonly auth: AdminAuthService,
    private readonly registry: CostRegistryService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Cloud switches: guards, recent requests and «пора включить» suggestions',
  })
  @ApiEnvelopeResponse(InfraOverviewDto)
  async infraOverview(): Promise<InfraOverviewDto> {
    const now = new Date();
    const [guards, requests, signals, engine] = await Promise.all([
      this.infra.guards(),
      this.infra.recent(20),
      this.registry.signals(now),
      this.registry.searchEngine(),
    ]);
    const suggestions = await this.infra.suggestions({
      pressures: signals.pressures,
      budgetRatio: signals.budgetRatio,
      searchEngine: engine,
    });
    return {
      guards,
      switchable: INFRA_SWITCHES.map((s) => s.id),
      requests,
      suggestions: suggestions.map((s) => {
        const entry = COST_REGISTRY.find((e) => e.id === s.id)!;
        return {
          id: s.id,
          name: entry.name,
          to: s.to,
          reason: s.reason,
          costDeltaUsd: costDelta(
            entry,
            switchFor(s.id)!,
            s.to === 'on' ? 'off' : 'on',
            s.to,
          ),
        };
      }),
    };
  }

  @Post('requests')
  @ApiOperation({
    summary:
      'Ask to switch one cloud item (starts the GitHub plan; nothing changes yet)',
  })
  @ApiEnvelopeResponse(InfraRequestDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    409: [E.FEATURE_DISABLED],
    429: [E.RATE_LIMITED],
  })
  async createInfraRequest(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateInfraRequestDto,
  ): Promise<InfraRequestDto> {
    try {
      return await this.infra.create(admin.id, admin.ip, dto.itemId, dto.to);
    } catch (e) {
      infraHttp(e);
    }
  }

  @Post('requests/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply the shown plan (needs a fresh 2FA code)',
  })
  @ApiEnvelopeResponse(InfraRequestDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  async confirmInfraRequest(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InfraRequestDto> {
    await this.auth.assertStepUp(admin.sessionId);
    try {
      return await this.infra.confirm(admin.id, admin.ip, id);
    } catch (e) {
      infraHttp(e);
    }
  }

  @Post('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Throw away a request that is not applied yet' })
  @ApiEnvelopeResponse(InfraRequestDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.FEATURE_DISABLED] })
  async cancelInfraRequest(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InfraRequestDto> {
    try {
      return await this.infra.cancel(admin.id, admin.ip, id);
    } catch (e) {
      infraHttp(e);
    }
  }

  @Post('requests/:id/rollback')
  @ApiOperation({
    summary: '«Откатить»: a new request back to the previous position',
  })
  @ApiEnvelopeResponse(InfraRequestDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
    429: [E.RATE_LIMITED],
  })
  async rollbackInfraRequest(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InfraRequestDto> {
    try {
      return await this.infra.rollback(admin.id, admin.ip, id);
    } catch (e) {
      infraHttp(e);
    }
  }
}
