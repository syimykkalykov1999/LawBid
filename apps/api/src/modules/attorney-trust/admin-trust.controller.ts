import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminTrustCardDto,
  BulkTrustDto,
  BulkTrustResultDto,
  DocumentRequestDto,
  RecomputeAllResultDto,
  TrustQueueItemDto,
  TrustQueueQueryDto,
  TrustAttorneyIdParamDto,
  TrustHoldDto,
  TrustHoldListItemDto,
  TrustNoteDto,
  TrustSettingsDto,
  TrustStatsDto,
} from './attorney-trust.dto';
import { AdminTrustService } from './admin-trust.service';

const E = ErrorCode;
const ERRORS = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN],
  404: [E.NOT_FOUND],
};

/**
 * Owner 2026-10-05: Admin → Верификация → «Уровни доверия». Verifiers and
 * the super admin (`trust` → area `verification`). The service writes its
 * own audit rows.
 */
@ApiTags('admin-trust')
@AdminEndpoint('verifier', 'super_admin')
@SkipAutoAudit()
@Controller('admin/trust')
export class AdminTrustController {
  constructor(private readonly admin: AdminTrustService) {}

  @Get('settings')
  @ApiOperation({ summary: 'What to require and the automatic actions' })
  @ApiEnvelopeResponse(TrustSettingsDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  getTrustSettings(): Promise<TrustSettingsDto> {
    return this.admin.settingsDto();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Change what to require and the automatic actions' })
  @ApiEnvelopeResponse(TrustSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  updateTrustSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: TrustSettingsDto,
  ): Promise<TrustSettingsDto> {
    return this.admin.updateSettings(admin, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Attorneys per level, holds, complaints' })
  @ApiEnvelopeResponse(TrustStatsDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  getTrustStats(): Promise<TrustStatsDto> {
    return this.admin.stats();
  }

  @Get('holds')
  @ApiOperation({ summary: 'Attorneys whose payments or bids are paused' })
  @ApiEnvelopeResponse(TrustHoldListItemDto, { isArray: true })
  @ApiErrors({ 403: [E.FORBIDDEN] })
  listTrustHolds(): Promise<TrustHoldListItemDto[]> {
    return this.admin.holds();
  }

  @Get('attorneys/:attorneyId')
  @ApiOperation({ summary: "One attorney's trust card with history" })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  getTrustCard(
    @Param() p: TrustAttorneyIdParamDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.card(p.attorneyId);
  }

  @Post('attorneys/:attorneyId/confirm-license')
  @ApiOperation({
    summary: "Verifier confirmed the license on the state bar's page",
  })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  confirmTrustLicense(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustNoteDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.confirmLicense(admin, p.attorneyId, dto.note ?? null);
  }

  @Post('attorneys/:attorneyId/unconfirm-license')
  @ApiOperation({ summary: 'Withdraw the staff confirmation of the license' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  unconfirmTrustLicense(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustNoteDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.unconfirmLicense(admin, p.attorneyId, dto.note ?? null);
  }

  @Post('attorneys/:attorneyId/confirm-documents')
  @ApiOperation({ summary: 'Verifier checked bar card + ID + selfie' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  confirmTrustDocuments(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustNoteDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.confirmDocuments(admin, p.attorneyId, dto.note ?? null);
  }

  @Post('attorneys/:attorneyId/confirm-firm-link')
  @ApiOperation({
    summary:
      "Verifier saw the firm's letter: the attorney works for the Stripe company",
  })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  confirmTrustFirmLink(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustNoteDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.confirmFirmLink(admin, p.attorneyId, dto.note ?? null);
  }

  @Get('queue')
  @ApiOperation({
    summary: 'Staff queue: attorneys waiting for a person, oldest first',
  })
  @ApiEnvelopeResponse(TrustQueueItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  trustQueue(@Query() q: TrustQueueQueryDto): Promise<TrustQueueItemDto[]> {
    return this.admin.queue({ reason: q.reason ?? null, q: q.q ?? null });
  }

  @Post('attorneys/:attorneyId/clear')
  @ApiOperation({
    summary: 'Подтвердить: staff vouch; badge and payments open for good',
  })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  clearTrust(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustNoteDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.clear(admin, p.attorneyId, dto.note ?? null);
  }

  @Post('attorneys/:attorneyId/unclear')
  @ApiOperation({ summary: 'Withdraw the staff clearance' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  unclearTrust(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustNoteDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.unclear(admin, p.attorneyId, dto.note ?? null);
  }

  @Post('attorneys/:attorneyId/request-documents')
  @ApiOperation({ summary: 'Запросить ещё: ask for documents from a template' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  requestTrustDocuments(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: DocumentRequestDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.requestDocuments(admin, p.attorneyId, dto);
  }

  @Post('attorneys/:attorneyId/reject')
  @ApiOperation({ summary: 'Отклонить: suspend the account, withdraw bids' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  rejectTrust(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustNoteDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.reject(admin, p.attorneyId, dto.note ?? null);
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Clear / request documents / reject / release many',
  })
  @ApiEnvelopeResponse(BulkTrustResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  bulkTrust(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: BulkTrustDto,
  ): Promise<BulkTrustResultDto> {
    return this.admin.bulk(admin, dto);
  }

  @Post('attorneys/:attorneyId/hold')
  @ApiOperation({ summary: 'Pause payments and/or bids' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  holdTrust(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustHoldDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.hold(admin, p.attorneyId, dto);
  }

  @Post('attorneys/:attorneyId/release')
  @ApiOperation({ summary: 'Lift holds after review' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  releaseTrust(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustHoldDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.release(admin, p.attorneyId, dto);
  }

  @Post('attorneys/:attorneyId/recompute')
  @ApiOperation({ summary: 'Recompute the level from the facts' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  recomputeTrust(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.recompute(admin, p.attorneyId);
  }

  @Post('recompute-all')
  @ApiOperation({
    summary: 'Recompute every attorney (after a settings change)',
  })
  @ApiEnvelopeResponse(RecomputeAllResultDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  recomputeAllTrust(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<RecomputeAllResultDto> {
    return this.admin.recomputeAll(admin);
  }
}
