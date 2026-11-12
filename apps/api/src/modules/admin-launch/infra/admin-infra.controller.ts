import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { boardEtag, notModified } from '../../../common/sync/cheap-etag';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../../common/dto/api-docs.decorators';
import { AdminSummaryService } from '../../../common/admin-summary/admin-summary.service';
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

/** 2026-11-08: the overview (settings, the last 20 requests, the status
 * signals, the live switch states) was rebuilt on every open and every
 * minute's poll of «Расходы» and «Масштаб» (prod: 1.4-1.7 s while the
 * page's other cards queued on the same 3 connections). Now a shared board
 * (AdminSummaryService.board), at most 15 s old before a background
 * rebuild; every button below forgets it so the next read is exact. */
const OVERVIEW_KEY = 'infra:overview';
const OVERVIEW_FRESH_MS = 15_000;

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
    private readonly summary: AdminSummaryService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Cloud switches: guards, recent requests and «пора включить» suggestions',
  })
  @ApiEnvelopeResponse(InfraOverviewDto)
  async infraOverview(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InfraOverviewDto | undefined> {
    const overview = await this.summary.board(
      OVERVIEW_KEY,
      () => this.buildOverview(),
      OVERVIEW_FRESH_MS,
      (d) => Array.isArray(d?.requests),
    );
    if (notModified(req, res, boardEtag(overview))) return undefined;
    return overview;
  }

  private async buildOverview(): Promise<InfraOverviewDto> {
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
      return await this.changed(
        this.infra.create(admin.id, admin.ip, dto.itemId, dto.to),
      );
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
      return await this.changed(this.infra.confirm(admin.id, admin.ip, id));
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
      return await this.changed(this.infra.cancel(admin.id, admin.ip, id));
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
      return await this.changed(this.infra.rollback(admin.id, admin.ip, id));
    } catch (e) {
      infraHttp(e);
    }
  }

  /** A request changed: the next overview read is rebuilt, not served. */
  private async changed<T>(p: Promise<T>): Promise<T> {
    try {
      return await p;
    } finally {
      await this.summary.drop(OVERVIEW_KEY);
    }
  }
}
