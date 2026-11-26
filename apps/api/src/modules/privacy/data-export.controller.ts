import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { DataExportRunner } from './data-export.runner';
import { DataExportIdParamDto, DataExportJobDto } from './privacy.dto';
import { AttorneyOnly } from '../auth/assistant/assistant-context';
import { SensitiveNoStore } from '../../common/cache/http-cache';

const E = ErrorCode;

/**
 * docs/06 §5.2 «Скачать мои данные» (Settings, reauth): queue the ZIP,
 * poll its status; the link also arrives by email (24 hours).
 */
@ApiTags('users')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AttorneyOnly()
// ASVS V14.3.2 (#18): sensitive answers are never stored by a browser.
@SensitiveNoStore()
@Controller('users/me/data-export')
export class DataExportController {
  constructor(
    private readonly exports: DataExportRunner,
    private readonly reauth: ReauthVerifier,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({
    name: 'X-Reauth-Token',
    required: true,
    description: 'reauthToken from POST /auth/reauth (5 minutes).',
  })
  @ApiOperation({ summary: 'Queue the user data export ZIP (docs/06 §5.2)' })
  @ApiEnvelopeResponse(DataExportJobDto)
  @ApiErrors({ 401: [E.REAUTH_INVALID], 403: [E.REAUTH_REQUIRED] })
  async requestDataExport(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<DataExportJobDto> {
    await this.reauth.assertValid(req);
    return this.exports.request(user);
  }

  /**
   * Detective R2B-12 (14.11): the link is the whole account, so it needs a
   * fresh reauth like the request itself (Google Takeout asks for the
   * password again before a download). The status stays readable without
   * one, so the app polls freely and asks for the reauth only to download.
   * Older apps never send the token: they still get the link while their
   * version is below `security.export_reauth_min_app_version` (empty = for
   * everyone, the rule is not switched on yet).
   */
  @Get(':exportId')
  @ApiHeader({
    name: 'X-Reauth-Token',
    required: false,
    description:
      'reauthToken from POST /auth/reauth (5 minutes, not consumed). Without it `url` is null once the admin setting security.export_reauth_min_app_version covers this app version.',
  })
  @ApiOperation({
    summary:
      'Export status; a fresh 24-hour signed link while it is ready (with a fresh reauth)',
  })
  @ApiEnvelopeResponse(DataExportJobDto)
  @ApiErrors({ 401: [E.REAUTH_INVALID], 404: [E.NOT_FOUND] })
  async getDataExport(
    @CurrentUser() user: RequestUser,
    @Param() params: DataExportIdParamDto,
    @Req() req: Request,
  ): Promise<DataExportJobDto> {
    const withLink = await this.reauth.validOrLegacyClient(
      req,
      'security.export_reauth_min_app_version',
    );
    return this.exports.status(user, params.exportId, { withLink });
  }
}
