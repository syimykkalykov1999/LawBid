import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AdminRoles } from '../../admin-access/admin-roles.decorator';
import { AdminRolesGuard } from '../../admin-access/admin-roles.guard';
import {
  CurrentAdmin,
  type AdminActor,
} from '../../admin-access/current-admin.decorator';
import {
  AdminAttorneyIdParamDto,
  AdminDocumentIdParamDto,
  AdminLicenseIdParamDto,
  AdminRequestIdParamDto,
  AdminRequestLicenseParamDto,
  AdminVerificationRequestDto,
  AttorneyVerificationStatusDto,
  DocumentUrlDto,
  LicenseDecisionDto,
  LicenseRecheckDto,
  RejectRequestDto,
  RequestInfoDto,
  SuspendAttorneyDto,
  VerificationQueueItemDto,
  VerificationQueueQueryDto,
  type VerificationQueuePage,
} from '../dto/admin-verification.dto';
import { VerificationAdminService } from '../services/verification-admin.service';

const E = ErrorCode;
const REVIEW_ERRORS = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN],
  404: [E.NOT_FOUND],
};

/**
 * Verifier admin API (docs/03 §2.5, stage 3.4). Only `verifier` and
 * `super_admin` (docs/06 §2.2) — AdminRolesGuard, deny by default. Every
 * decision and document view is written to audit_log.
 */
@ApiTags('admin-verification')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AdminRoles('verifier', 'super_admin')
@UseGuards(AdminRolesGuard)
@Controller('admin/verification')
export class AdminVerificationController {
  constructor(private readonly admin: VerificationAdminService) {}

  @Get('requests')
  @ApiOperation({ summary: 'Verifier queue, oldest first' })
  @ApiEnvelopeResponse(VerificationQueueItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  listVerificationQueue(
    @Query() query: VerificationQueueQueryDto,
  ): Promise<VerificationQueuePage> {
    return this.admin.queue(query);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Request card' })
  @ApiEnvelopeResponse(AdminVerificationRequestDto)
  @ApiErrors(REVIEW_ERRORS)
  getVerificationCard(
    @Param() params: AdminRequestIdParamDto,
  ): Promise<AdminVerificationRequestDto> {
    return this.admin.card(params.id);
  }

  @Post('documents/:documentId/url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Short-lived signed link to a document (audited view)',
  })
  @ApiEnvelopeResponse(DocumentUrlDto)
  @ApiErrors({ ...REVIEW_ERRORS, 503: [E.FILE_STORAGE_UNAVAILABLE] })
  getVerificationDocumentUrl(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminDocumentIdParamDto,
  ): Promise<DocumentUrlDto> {
    return this.admin.documentUrl(admin, params.documentId);
  }

  @Post('requests/:id/take')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a submitted request into work (lock)' })
  @ApiEnvelopeResponse(AdminVerificationRequestDto)
  @ApiErrors({
    ...REVIEW_ERRORS,
    409: [E.VERIFICATION_INVALID_STATUS, E.VERIFICATION_REQUEST_LOCKED],
  })
  takeVerificationRequest(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminRequestIdParamDto,
  ): Promise<AdminVerificationRequestDto> {
    return this.admin.take(admin, params.id);
  }

  @Post('requests/:id/licenses/:licenseId/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify or reject one license of the request' })
  @ApiEnvelopeResponse(AdminVerificationRequestDto)
  @ApiErrors({
    ...REVIEW_ERRORS,
    409: [E.VERIFICATION_INVALID_STATUS, E.VERIFICATION_REQUEST_LOCKED],
  })
  decideVerificationLicense(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminRequestLicenseParamDto,
    @Body() dto: LicenseDecisionDto,
  ): Promise<AdminVerificationRequestDto> {
    return this.admin.decideLicense(admin, params.id, params.licenseId, dto);
  }

  @Post('requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve the request (fully or partially)' })
  @ApiEnvelopeResponse(AdminVerificationRequestDto)
  @ApiErrors({
    ...REVIEW_ERRORS,
    409: [
      E.VERIFICATION_INVALID_STATUS,
      E.VERIFICATION_REQUEST_LOCKED,
      E.VERIFICATION_DECISION_INCOMPLETE,
    ],
  })
  approveVerificationRequest(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminRequestIdParamDto,
  ): Promise<AdminVerificationRequestDto> {
    return this.admin.approve(admin, params.id);
  }

  @Post('requests/:id/request-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the attorney for more information' })
  @ApiEnvelopeResponse(AdminVerificationRequestDto)
  @ApiErrors({
    ...REVIEW_ERRORS,
    409: [E.VERIFICATION_INVALID_STATUS, E.VERIFICATION_REQUEST_LOCKED],
  })
  requestVerificationInfo(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminRequestIdParamDto,
    @Body() dto: RequestInfoDto,
  ): Promise<AdminVerificationRequestDto> {
    return this.admin.requestInfo(admin, params.id, dto.message);
  }

  @Post('requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject the request with a reason code' })
  @ApiEnvelopeResponse(AdminVerificationRequestDto)
  @ApiErrors({
    ...REVIEW_ERRORS,
    409: [E.VERIFICATION_INVALID_STATUS, E.VERIFICATION_REQUEST_LOCKED],
  })
  rejectVerificationRequest(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminRequestIdParamDto,
    @Body() dto: RejectRequestDto,
  ): Promise<AdminVerificationRequestDto> {
    return this.admin.reject(admin, params.id, dto);
  }

  @Post('licenses/:licenseId/recheck')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-run the bar lookup or queue the license for manual review',
  })
  @ApiEnvelopeResponse(LicenseRecheckDto)
  @ApiErrors({ ...REVIEW_ERRORS, 409: [E.VERIFICATION_INVALID_STATUS] })
  recheckLicense(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminLicenseIdParamDto,
  ): Promise<LicenseRecheckDto> {
    return this.admin.recheck(admin, params.licenseId);
  }

  @Post('attorneys/:attorneyId/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspend an attorney (hidden from search, active bids withdrawn)',
  })
  @ApiEnvelopeResponse(AttorneyVerificationStatusDto)
  @ApiErrors({ ...REVIEW_ERRORS, 409: [E.VERIFICATION_INVALID_STATUS] })
  suspendAttorney(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminAttorneyIdParamDto,
    @Body() dto: SuspendAttorneyDto,
  ): Promise<AttorneyVerificationStatusDto> {
    return this.admin.suspend(admin, params.attorneyId, dto.reason);
  }

  @Post('attorneys/:attorneyId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a suspended attorney' })
  @ApiEnvelopeResponse(AttorneyVerificationStatusDto)
  @ApiErrors({ ...REVIEW_ERRORS, 409: [E.VERIFICATION_INVALID_STATUS] })
  restoreAttorney(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AdminAttorneyIdParamDto,
  ): Promise<AttorneyVerificationStatusDto> {
    return this.admin.restore(admin, params.attorneyId);
  }
}
