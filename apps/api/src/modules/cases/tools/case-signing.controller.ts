import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { CaseIdParamDto } from '../dto/case-requests.dto';
import { CaseSigningService } from './case-signing.service';
import {
  CreateSignRequestDto,
  DeclineSignDto,
  SignDto,
  SignRequestDto,
  SignRequestIdParamDto,
  SignVerifyDto,
} from './signing.dto';
import { RequiresDuty } from '../../auth/assistant/assistant-context';

const E = ErrorCode;
const ERR = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN, E.ASSISTANT_NOT_ALLOWED],
  404: [E.CASE_NOT_FOUND, E.NOT_FOUND],
  409: [E.CASE_INVALID_STATE],
};

/** Owner 2026-10-20: documents both sides of a case sign in the app. */
@ApiTags('case-signing')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('cases/:id/signing')
export class CaseSigningController {
  constructor(private readonly signing: CaseSigningService) {}

  @RequiresDuty('cases')
  @Get()
  @ApiOperation({
    summary: 'Documents of the case waiting for / carrying signatures',
  })
  @ApiEnvelopeResponse(SignRequestDto, { isArray: true })
  @ApiErrors(ERR)
  listSignRequests(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Req() req: Request,
  ) {
    return this.signing.list(u, p.id, { ip: req.ip ?? null });
  }

  @RequiresDuty('cases')
  @Post()
  @ApiOperation({
    summary: 'Ask both sides to sign a PDF (uploaded as a case attachment)',
  })
  @ApiEnvelopeResponse(SignRequestDto, { isArray: true })
  @ApiErrors(ERR)
  createSignRequest(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: CreateSignRequestDto,
  ) {
    return this.signing.create(u, p.id, dto);
  }

  @RequiresDuty('cases')
  @Post(':requestId/sign')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Sign with a drawn signature or the typed name; the second signature finishes the document',
  })
  @ApiEnvelopeResponse(SignRequestDto, { isArray: true })
  @ApiErrors(ERR)
  signDocument(
    @CurrentUser() u: RequestUser,
    @Param() p: SignRequestIdParamDto,
    @Body() dto: SignDto,
    @Req() req: Request,
  ) {
    return this.signing.sign(u, p.id, p.requestId, dto, {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }

  @RequiresDuty('cases')
  @Post(':requestId/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Decline to sign (with a reason)' })
  @ApiEnvelopeResponse(SignRequestDto, { isArray: true })
  @ApiErrors(ERR)
  declineSignRequest(
    @CurrentUser() u: RequestUser,
    @Param() p: SignRequestIdParamDto,
    @Body() dto: DeclineSignDto,
  ) {
    return this.signing.decline(u, p.id, p.requestId, dto.reason);
  }

  @RequiresDuty('cases')
  @Post(':requestId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'The side that asked withdraws the request' })
  @ApiEnvelopeResponse(SignRequestDto, { isArray: true })
  @ApiErrors(ERR)
  cancelSignRequest(
    @CurrentUser() u: RequestUser,
    @Param() p: SignRequestIdParamDto,
  ) {
    return this.signing.cancel(u, p.id, p.requestId);
  }

  @RequiresDuty('cases')
  @Post(':requestId/resend')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'The side that asked reminds the one who has not signed (also revives an expired request)',
  })
  @ApiEnvelopeResponse(SignRequestDto, { isArray: true })
  @ApiErrors(ERR)
  resendSignRequest(
    @CurrentUser() u: RequestUser,
    @Param() p: SignRequestIdParamDto,
  ) {
    return this.signing.resend(u, p.id, p.requestId);
  }

  @RequiresDuty('cases')
  @Get(':requestId/verify')
  @ApiOperation({
    summary: 'Recompute the file hashes and the journal chain of a document',
  })
  @ApiEnvelopeResponse(SignVerifyDto)
  @ApiErrors(ERR)
  verifySignRequest(
    @CurrentUser() u: RequestUser,
    @Param() p: SignRequestIdParamDto,
  ) {
    return this.signing.verify(u, p.id, p.requestId);
  }
}
