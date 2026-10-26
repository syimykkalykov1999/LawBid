import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
  BarNumberBlockDto,
  BarNumberBlockIdParamDto,
  BarNumberBlocksQueryDto,
  BlockBarNumberDto,
  UnblockBarNumberDto,
  BulkTrustDto,
  ClearedByItemDto,
  ClearedByQueryDto,
  StaffDecisionStatsDto,
  BulkTrustResultDto,
  DocumentRequestDto,
  RecomputeAllResultDto,
  TrustQueueItemDto,
  TrustQueueQueryDto,
  TrustAttorneyListItemDto,
  TrustAttorneyListQueryDto,
  TrustPresetDto,
  TrustSetStatusDto,
  StaffDecisionsQueryDto,
  TrustAttorneyIdParamDto,
  TrustHoldDto,
  TrustReleaseDto,
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
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.card(p.attorneyId, admin.countries);
  }

  @Post('attorneys/:attorneyId/confirm-license')
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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

  @Post('settings/preset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Apply a preset: off («Выключить всё»), soft, standard, strict, all («Включить всё»)',
  })
  @ApiEnvelopeResponse(TrustSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  applyTrustPreset(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: TrustPresetDto,
  ): Promise<TrustSettingsDto> {
    return this.admin.applyPreset(admin, dto.preset);
  }

  @Get('attorneys')
  @ApiOperation({
    summary: '«Галочки → Адвокаты»: every attorney with their badge status',
  })
  @ApiEnvelopeResponse(TrustAttorneyListItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  trustAttorneys(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: TrustAttorneyListQueryDto,
  ): Promise<TrustAttorneyListItemDto[]> {
    return this.admin.list({
      status: q.status ?? null,
      q: q.q ?? null,
      limit: q.limit,
      countries: admin.countries,
    });
  }

  @Post('attorneys/:attorneyId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set the badge status by hand (reason required, audited)',
  })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  setTrustStatus(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustSetStatusDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.setStatus(admin, p.attorneyId, dto);
  }

  @Get('queue')
  @ApiOperation({
    summary: 'Staff queue: attorneys waiting for a person, oldest first',
  })
  @ApiEnvelopeResponse(TrustQueueItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  trustQueue(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: TrustQueueQueryDto,
  ): Promise<TrustQueueItemDto[]> {
    return this.admin.queue({
      reason: q.reason ?? null,
      q: q.q ?? null,
      countries: admin.countries,
    });
  }

  @Get('staff-decisions')
  @ApiOperation({
    summary: 'Who approved whom: decisions per admin, speed, what came after',
  })
  @ApiEnvelopeResponse(StaffDecisionStatsDto, { isArray: true })
  @ApiErrors({ 403: [E.FORBIDDEN] })
  staffDecisions(
    @Query() q: StaffDecisionsQueryDto,
  ): Promise<StaffDecisionStatsDto[]> {
    return this.admin.staffDecisions(q);
  }

  @Get('cleared-by')
  @ApiOperation({
    summary: 'Attorneys one admin cleared, and what happened since',
  })
  @ApiEnvelopeResponse(ClearedByItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  clearedBy(@Query() q: ClearedByQueryDto): Promise<ClearedByItemDto[]> {
    return this.admin.clearedBy(q.adminId, q);
  }

  @Post('attorneys/:attorneyId/clear')
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift holds after review' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  releaseTrust(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
    @Body() dto: TrustReleaseDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.release(admin, p.attorneyId, dto);
  }

  @Post('attorneys/:attorneyId/recompute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recompute the level from the facts' })
  @ApiEnvelopeResponse(AdminTrustCardDto)
  @ApiErrors(ERRORS)
  recomputeTrust(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TrustAttorneyIdParamDto,
  ): Promise<AdminTrustCardDto> {
    return this.admin.recompute(admin, p.attorneyId);
  }

  // --- Owner 2026-10-05 07:00: «Заблокированные номера» -------------------

  @Get('blocked-bar-numbers')
  @ApiOperation({
    summary:
      'Bar numbers that cannot register again: reason, who blocked, attempts',
  })
  @ApiEnvelopeResponse(BarNumberBlockDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  blockedBarNumbers(
    @Query() q: BarNumberBlocksQueryDto,
  ): Promise<BarNumberBlockDto[]> {
    return this.admin.blockedBarNumbers({
      q: q.q ?? null,
      status: q.status ?? null,
      limit: q.limit,
    });
  }

  @Post('blocked-bar-numbers')
  @ApiOperation({ summary: 'Block a bar number by hand (reason required)' })
  @ApiEnvelopeResponse(BarNumberBlockDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  blockBarNumber(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: BlockBarNumberDto,
  ): Promise<BarNumberBlockDto> {
    return this.admin.blockBarNumber(admin, dto);
  }

  @Get('blocked-bar-numbers/:id')
  @ApiOperation({ summary: 'One blocked bar number with its history' })
  @ApiEnvelopeResponse(BarNumberBlockDto)
  @ApiErrors(ERRORS)
  blockedBarNumber(
    @Param() p: BarNumberBlockIdParamDto,
  ): Promise<BarNumberBlockDto> {
    return this.admin.blockedBarNumber(p.id);
  }

  @Post('blocked-bar-numbers/:id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lift the block (the person explained / proved); reason required',
  })
  @ApiEnvelopeResponse(BarNumberBlockDto)
  @ApiErrors(ERRORS)
  unblockBarNumber(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: BarNumberBlockIdParamDto,
    @Body() dto: UnblockBarNumberDto,
  ): Promise<BarNumberBlockDto> {
    return this.admin.unblockBarNumber(admin, p.id, dto.reason);
  }

  @Post('recompute-all')
  @HttpCode(HttpStatus.OK)
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
