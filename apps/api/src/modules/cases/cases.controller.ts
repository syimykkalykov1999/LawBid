import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
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
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { RequireIdempotencyKeyGuard } from '../../idempotency/require-idempotency-key.guard';
import type { RequestMeta } from '../auth/services/session.service';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { CasesService } from './cases.service';
import {
  CaseIdParamDto,
  CreateCaseDto,
  ListMyCasesQueryDto,
  UpdateCaseDto,
} from './dto/case-requests.dto';
import {
  CaseDeletedDto,
  CaseDto,
  CaseSummaryDto,
  type CasePage,
} from './dto/case-responses.dto';

const E = ErrorCode;

/**
 * docs/04_CASES_BIDS.md §3, §11.1, §15 (stage 4.2) — case creation and
 * management from the client's side. Every route needs a bearer token
 * (global JwtAuthGuard); role and ownership checks live in CasesService.
 *
 * Attorney-facing case routes (docs/04 §4, stage 4.3) belong in a
 * separate controller file, not here, to keep this file's merge surface
 * small while both stages are in flight.
 */
@ApiTags('cases')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post('cases')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Publish a case (client, docs/04 §3.1-§3.4)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Required: a retry with the same key and body returns the first result instead of a second case.',
  })
  @ApiEnvelopeResponse(CaseDto, { status: 201 })
  @ApiErrors({
    400: [
      E.VALIDATION_ERROR,
      E.CASE_CONTAINS_CONTACT_INFO,
      E.IDEMPOTENCY_KEY_REQUIRED,
    ],
    403: [
      E.FORBIDDEN,
      E.CLIENT_CONTACTS_INCOMPLETE,
      E.ONBOARDING_INCOMPLETE,
      E.CLIENT_CONTACT_SHARING_CONSENT_REQUIRED,
    ],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
  })
  createCase(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCaseDto,
    @Req() req: Request,
  ): Promise<CaseDto> {
    return this.cases.create(user, dto, meta(req));
  }

  @Patch('cases/:id')
  @ApiOperation({ summary: 'Edit an open case (client, docs/04 §3.5)' })
  @ApiEnvelopeResponse(CaseDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.CASE_CONTAINS_CONTACT_INFO],
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_FOUND],
    409: [E.CASE_INVALID_STATE],
  })
  updateCase(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
    @Body() dto: UpdateCaseDto,
  ): Promise<CaseDto> {
    return this.cases.update(user, params.id, dto);
  }

  @Post('cases/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close a case without choosing a bid (client, docs/04 §3.5)',
  })
  @ApiEnvelopeResponse(CaseDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_FOUND],
    409: [E.CASE_INVALID_STATE],
  })
  closeCase(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<CaseDto> {
    return this.cases.close(user, params.id);
  }

  @Delete('cases/:id')
  @ApiOperation({
    summary: 'Soft-delete a case (client, open/archived only, docs/04 §3.5)',
  })
  @ApiEnvelopeResponse(CaseDeletedDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_FOUND],
    409: [E.CASE_INVALID_STATE],
  })
  deleteCase(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<{ deleted: true }> {
    return this.cases.remove(user, params.id);
  }

  @Post('cases/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore an archived case (client, docs/04 §10.1)',
  })
  @ApiEnvelopeResponse(CaseDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_FOUND],
    409: [E.CASE_INVALID_STATE],
  })
  restoreCase(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<CaseDto> {
    return this.cases.restore(user, params.id);
  }

  @Post('cases/:id/keep-alive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '"Still relevant" — resets the staleness timer (docs/04 §10.2)',
  })
  @ApiEnvelopeResponse(CaseDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_FOUND],
    409: [E.CASE_INVALID_STATE],
  })
  keepCaseAlive(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<CaseDto> {
    return this.cases.keepAlive(user, params.id);
  }

  @Get('users/me/cases')
  @ApiOperation({ summary: '"My cases" tabs (client, docs/04 §11.1)' })
  @ApiEnvelopeResponse(CaseSummaryDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  listMyCases(
    @CurrentUser() user: RequestUser,
    @Query() query: ListMyCasesQueryDto,
  ): Promise<CasePage> {
    return this.cases.listMine(user, query);
  }
}

function meta(req: Request): RequestMeta {
  return {
    ip: req.ip,
    userAgent: req.header('user-agent'),
    deviceId: req.header('x-device-id'),
  };
}
