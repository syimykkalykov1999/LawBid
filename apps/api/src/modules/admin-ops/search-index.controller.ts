import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Post,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  SEARCH_AUTO_LOG_KEY,
  parseSearchAutoLog,
} from '../../common/search/search-reindex.port';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  ReindexRefused,
  SearchReindexService,
} from '../search/search-reindex.service';
import {
  type SearchAutoStepDto,
  SearchIndexStatusDto,
  StartSearchReindexDto,
  toSearchIndexStatusDto,
} from './search-index.dto';

const E = ErrorCode;

/** 2026-11-08: the card asked the key store and the search engine (layout,
 * mapping version per index) on every open and every minute's poll of
 * «Масштаб» (prod: 1.2-1.4 s while the page's other cards queued on the
 * same 3 connections). Now a shared board (AdminSummaryService.board), at
 * most 15 s old before a background rebuild; the buttons store the status
 * they just read. */
const STATUS_KEY = 'search:index-status';
const STATUS_FRESH_MS = 15_000;

/**
 * Owner 2026-10-25: zero-downtime search reindex from the admin «Масштаб»
 * page (super_admin). Start / Swap / Rollback need a fresh 2FA code
 * (step-up) and nothing else: no second admin. Every action is audited.
 * See docs/runbooks/search-reindex.md.
 */
@ApiTags('admin-ops')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/system-health/search-index')
export class SearchIndexController {
  constructor(
    private readonly reindex: SearchReindexService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly summary: AdminSummaryService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** The last 5 steps search «Авто» took by itself (infra-auto searchPass). */
  private async autoSteps(): Promise<SearchAutoStepDto[]> {
    const lines =
      (await this.redis?.lrange(SEARCH_AUTO_LOG_KEY, 0, 4).catch(() => null)) ??
      [];
    return parseSearchAutoLog(lines);
  }

  @Get()
  @ApiOperation({
    summary: 'Search index generations, aliases, counts and reindex progress',
  })
  @ApiEnvelopeResponse(SearchIndexStatusDto)
  searchIndexStatus(): Promise<SearchIndexStatusDto> {
    return this.summary.board(
      STATUS_KEY,
      async () =>
        toSearchIndexStatusDto(
          await this.reindex.status(),
          await this.autoSteps(),
        ),
      STATUS_FRESH_MS,
      (d) =>
        typeof d?.engineConfigured === 'boolean' && Array.isArray(d.autoSteps),
    );
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a zero-downtime reindex (needs step-up)' })
  @ApiEnvelopeResponse(SearchIndexStatusDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  start(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: StartSearchReindexDto,
  ): Promise<SearchIndexStatusDto> {
    return this.act(admin, 'search.reindex_start', () =>
      this.reindex.start(dto.source ?? 'postgres'),
    );
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify, then swap the read alias; later the write alias (needs step-up)',
  })
  @ApiEnvelopeResponse(SearchIndexStatusDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  swap(@CurrentAdmin() admin: AdminActor): Promise<SearchIndexStatusDto> {
    return this.act(admin, 'search.reindex_swap', () => this.reindex.swap());
  }

  @Post('rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel the build or go back to the old index (needs step-up)',
  })
  @ApiEnvelopeResponse(SearchIndexStatusDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 409: [E.FEATURE_DISABLED] })
  rollback(@CurrentAdmin() admin: AdminActor): Promise<SearchIndexStatusDto> {
    return this.act(admin, 'search.reindex_rollback', () =>
      this.reindex.rollback(),
    );
  }

  private async act(
    admin: AdminActor,
    action: string,
    run: () => Promise<{ phase: string }>,
  ): Promise<SearchIndexStatusDto> {
    await this.auth.assertStepUp(admin.sessionId);
    let phase: string;
    try {
      phase = (await run()).phase;
    } catch (e) {
      if (e instanceof ReindexRefused) {
        throw new HttpException(
          { code: E.FEATURE_DISABLED, message: e.message },
          HttpStatus.CONFLICT,
        );
      }
      throw e;
    }
    await this.audit.record({
      adminId: admin.id,
      action,
      targetType: 'system',
      targetId: null,
      before: null,
      after: { phase },
      ip: admin.ip,
    });
    const status = toSearchIndexStatusDto(
      await this.reindex.status(),
      await this.autoSteps(),
    );
    await this.summary.put(STATUS_KEY, status);
    return status;
  }
}
