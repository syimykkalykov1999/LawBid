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

const E = ErrorCode;

/**
 * docs/06 §5.2 «Скачать мои данные» (Settings, reauth): queue the ZIP,
 * poll its status; the link also arrives by email (24 hours).
 */
@ApiTags('users')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AttorneyOnly()
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

  @Get(':exportId')
  @ApiOperation({
    summary: 'Export status; a fresh 24-hour signed link while it is ready',
  })
  @ApiEnvelopeResponse(DataExportJobDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getDataExport(
    @CurrentUser() user: RequestUser,
    @Param() params: DataExportIdParamDto,
  ): Promise<DataExportJobDto> {
    return this.exports.status(user, params.exportId);
  }
}
