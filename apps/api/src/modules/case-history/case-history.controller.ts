import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { ReauthVerifier } from '../auth/services/reauth-verifier.service';
import type { RequestMeta } from '../auth/services/session.service';
import { CaseHistoryExportRunner } from './case-history-export.runner';
import { CaseHistoryService } from './case-history.service';
import {
  CaseHistoryDetailDto,
  CaseHistoryExportDto,
  CaseHistoryItemDto,
  HistoryCaseIdParamDto,
  HistoryExportIdParamDto,
  ListCaseHistoryQueryDto,
  type CaseHistoryPage,
} from './dto/case-history.dto';

const E = ErrorCode;
const Reauth = ApiHeader({
  name: 'X-Reauth-Token',
  required: true,
  description: 'reauthToken from POST /auth/reauth (5 minutes).',
});
const REAUTH_ERRORS = {
  401: [E.REAUTH_INVALID],
  403: [E.REAUTH_REQUIRED, E.FORBIDDEN],
} as const;

/**
 * docs/04_CASES_BIDS.md §12, §15 (stage 4.7). Viewing (list, timeline)
 * and the export request need a valid reauth token for its 5-minute
 * life; each download link consumes one ("при повторном скачивании нужен
 * новый reauth"). Read-only: no update/delete route exists.
 */
@ApiTags('case-history')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('users/me/case-history')
export class CaseHistoryController {
  constructor(
    private readonly history: CaseHistoryService,
    private readonly exports: CaseHistoryExportRunner,
    private readonly reauth: ReauthVerifier,
  ) {}

  @Get()
  @Reauth
  @ApiOperation({ summary: 'Case history list (docs/04 §12)' })
  @ApiEnvelopeResponse(CaseHistoryItemDto, { isArray: true })
  @ApiErrors({ ...REAUTH_ERRORS, 400: [E.VALIDATION_ERROR] })
  async listCaseHistory(
    @CurrentUser() user: RequestUser,
    @Query() query: ListCaseHistoryQueryDto,
    @Req() req: Request,
  ): Promise<CaseHistoryPage> {
    await this.reauth.assertValid(req);
    return this.history.list(user, query, meta(req));
  }

  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @Reauth
  @ApiOperation({ summary: 'Queue the case history PDF (docs/04 §12)' })
  @ApiEnvelopeResponse(CaseHistoryExportDto)
  @ApiErrors(REAUTH_ERRORS)
  async exportCaseHistory(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<CaseHistoryExportDto> {
    await this.reauth.assertValid(req);
    this.history.visibleWhere(user);
    return this.exports.enqueue(user);
  }

  @Get('export/:exportId')
  @Reauth
  @ApiOperation({
    summary:
      'Export status; when ready, a 10-minute signed PDF link (consumes the reauth token)',
  })
  @ApiEnvelopeResponse(CaseHistoryExportDto)
  @ApiErrors({ ...REAUTH_ERRORS, 404: [E.NOT_FOUND] })
  async getCaseHistoryExport(
    @CurrentUser() user: RequestUser,
    @Param() params: HistoryExportIdParamDto,
    @Req() req: Request,
  ): Promise<CaseHistoryExportDto> {
    // Polling while the PDF is queued keeps the token; issuing the
    // download link consumes it ("при повторном скачивании нужен новый
    // reauth", docs/04 §12).
    await this.reauth.assertValid(req);
    const status = await this.exports.status(user, params.exportId, {
      withLink: false,
    });
    if (status.status !== 'ready') return status;
    await this.reauth.assertAndConsume(req);
    return this.exports.status(user, params.exportId, { withLink: true });
  }

  @Get(':caseId')
  @Reauth
  @ApiOperation({ summary: 'Case timeline from case_journal (docs/04 §12)' })
  @ApiEnvelopeResponse(CaseHistoryDetailDto)
  @ApiErrors({ ...REAUTH_ERRORS, 404: [E.CASE_NOT_FOUND] })
  async getCaseHistory(
    @CurrentUser() user: RequestUser,
    @Param() params: HistoryCaseIdParamDto,
    @Req() req: Request,
  ): Promise<CaseHistoryDetailDto> {
    await this.reauth.assertValid(req);
    return this.history.detail(user, params.caseId, meta(req));
  }
}

function meta(req: Request): RequestMeta {
  return {
    ip: req.ip,
    userAgent: req.header('user-agent') ?? undefined,
    deviceId: req.header('x-device-id') ?? undefined,
  };
}
