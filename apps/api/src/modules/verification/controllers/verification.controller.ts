import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
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
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import {
  AddLicenseDto,
  AttachDocumentDto,
  RequestDocumentParamDto,
  RequestIdParamDto,
  RequestLicenseParamDto,
  SubmitVerificationRequestDto,
  UpdateVerificationRequestDto,
} from '../dto/verification-requests.dto';
import {
  SelfieCaptureTokenDto,
  SelfieHandoffDto,
  VerificationOverviewDto,
  VerificationRequestDto,
} from '../dto/verification-responses.dto';
import { VerificationRequestsService } from '../services/verification-requests.service';
import { SelfieHandoffService } from '../services/selfie-handoff.service';
import { AttorneyOnly } from '../../auth/assistant/assistant-context';

const E = ErrorCode;
const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'Resource-creating POST: a retry with the same key and body is applied once (see IdempotencyInterceptor).',
};
const ATTORNEY_ERRORS = {
  403: [E.FORBIDDEN, E.ATTORNEY_SUSPENDED],
  404: [E.NOT_FOUND],
};

/**
 * Attorney verification requests (docs/03 §2.1–§2.3, stage 3.3). Access:
 * the caller's own attorney profile only (role read from the DB);
 * someone else's request id is a 404.
 */
@ApiTags('verification')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AttorneyOnly()
@Controller('verification')
export class VerificationController {
  constructor(
    private readonly requests: VerificationRequestsService,
    private readonly handoff: SelfieHandoffService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Verification status, latest request and submission budget',
  })
  @ApiEnvelopeResponse(VerificationOverviewDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  getVerificationOverview(
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ): Promise<VerificationOverviewDto> {
    return this.requests.overview(user.sub, new Date(), ip);
  }

  @Post('requests')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a draft verification request' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(VerificationRequestDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    409: [E.VERIFICATION_ALREADY_PENDING, E.IDEMPOTENCY_KEY_CONFLICT],
    429: [E.VERIFICATION_SUBMISSION_LIMIT, E.RATE_LIMITED],
  })
  createVerificationRequest(
    @CurrentUser() user: RequestUser,
  ): Promise<VerificationRequestDto> {
    return this.requests.create(user.sub);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'One own verification request' })
  @ApiEnvelopeResponse(VerificationRequestDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
  })
  getVerificationRequest(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestIdParamDto,
  ): Promise<VerificationRequestDto> {
    return this.requests.get(user.sub, params.id);
  }

  @Patch('requests/:id')
  @ApiOperation({ summary: 'Set the comment for the verifier (≤500)' })
  @ApiEnvelopeResponse(VerificationRequestDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    409: [E.VERIFICATION_INVALID_STATUS],
  })
  updateVerificationRequest(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestIdParamDto,
    @Body() dto: UpdateVerificationRequestDto,
  ): Promise<VerificationRequestDto> {
    return this.requests.updateComment(
      user.sub,
      params.id,
      dto.applicantComment,
    );
  }

  @Post('requests/:id/licenses')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Add a state license (state + bar number)' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(VerificationRequestDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR, E.BAR_NUMBER_FORMAT_INVALID],
    403: [E.FORBIDDEN, E.ATTORNEY_SUSPENDED, E.COUNTRY_NOT_AVAILABLE],
    409: [
      E.LICENSE_ALREADY_REGISTERED,
      E.LICENSE_ALREADY_ADDED,
      E.VERIFICATION_INVALID_STATUS,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
    429: [E.BAR_ATTEMPTS_COOLDOWN],
  })
  addVerificationLicense(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestIdParamDto,
    @Body() dto: AddLicenseDto,
    @Ip() ip: string,
  ): Promise<VerificationRequestDto> {
    return this.requests.addLicense(user.sub, params.id, dto, ip);
  }

  @Delete('requests/:id/licenses/:licenseId')
  @ApiOperation({ summary: 'Remove a license added to this request' })
  @ApiEnvelopeResponse(VerificationRequestDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    409: [E.VERIFICATION_INVALID_STATUS],
  })
  removeVerificationLicense(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestLicenseParamDto,
  ): Promise<VerificationRequestDto> {
    return this.requests.removeLicense(user.sub, params.id, params.licenseId);
  }

  @Post('requests/:id/documents')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary:
      'Attach a clean uploaded file (bar license per state, identity document side, selfie)',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(VerificationRequestDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    409: [
      E.FILE_NOT_ATTACHABLE,
      E.VERIFICATION_INVALID_STATUS,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
  })
  attachVerificationDocument(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestIdParamDto,
    @Body() dto: AttachDocumentDto,
  ): Promise<VerificationRequestDto> {
    return this.requests.attachDocument(user.sub, params.id, dto);
  }

  // flag: none gated by the admin switch verification.selfie_live_capture_required (issuing a token is harmless when it is off)
  @Post('requests/:id/selfie-capture')
  @ApiOperation({
    summary:
      'One-time selfie capture token (owner 2026-10-28): the app asks for it before opening the guided selfie camera; the selfie attach sends it back',
  })
  @ApiEnvelopeResponse(SelfieCaptureTokenDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    409: [E.VERIFICATION_INVALID_STATUS],
  })
  issueSelfieCaptureToken(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestIdParamDto,
  ): Promise<SelfieCaptureTokenDto> {
    return this.requests.issueSelfieCapture(user.sub, params.id);
  }

  // flag: none a text to the caller's own number on their request, rate-limited (3 an hour)
  @Post('requests/:id/selfie-handoff-sms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Owner 2026-10-28: text the «continue on the phone» link (the wizard resumes this draft at the selfie step) to the attorney's own verified number",
  })
  @ApiEnvelopeResponse(SelfieHandoffDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    409: [E.VERIFICATION_INVALID_STATUS],
    429: [E.RATE_LIMITED],
  })
  sendSelfieHandoffSms(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestIdParamDto,
  ): Promise<SelfieHandoffDto> {
    return this.handoff.sendLink(user.sub, params.id);
  }

  @Delete('requests/:id/documents/:documentId')
  @ApiOperation({ summary: 'Remove a document from a draft' })
  @ApiEnvelopeResponse(VerificationRequestDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    409: [E.VERIFICATION_INVALID_STATUS],
  })
  removeVerificationDocument(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestDocumentParamDto,
  ): Promise<VerificationRequestDto> {
    return this.requests.removeDocument(user.sub, params.id, params.documentId);
  }

  @Post('requests/:id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submit a draft, or resubmit after needs_more_info (answer of the attorney)',
  })
  @ApiEnvelopeResponse(VerificationRequestDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR, E.VERIFICATION_INCOMPLETE],
    409: [E.VERIFICATION_INVALID_STATUS],
    429: [E.VERIFICATION_SUBMISSION_LIMIT, E.RATE_LIMITED],
  })
  submitVerificationRequest(
    @CurrentUser() user: RequestUser,
    @Param() params: RequestIdParamDto,
    @Body() dto: SubmitVerificationRequestDto,
    @Ip() ip: string,
  ): Promise<VerificationRequestDto> {
    return this.requests.submit(user.sub, params.id, dto, ip);
  }
}
