import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  HttpStatus,
  Inject,
  Param,
  Post,
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
  Justification,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  ERASURE_RECORDS,
  type ErasureRecords,
} from '../../common/privacy/privacy.ports';
import {
  CreateLegalExportDto,
  ErasureRecordDto,
  CreateLegalHoldDto,
  LegalAccountCardDto,
  LegalDownloadDto,
  LegalExportDto,
  LegalExportParamDto,
  LegalHoldDto,
  LegalHoldParamDto,
  LegalLookupHitDto,
  LegalLookupQueryDto,
  LegalRequestParamDto,
  LegalUserParamDto,
} from './legal-export.dto';
import { LegalExportService, LEGAL_AUDIT } from './legal-export.service';
import { LegalLookupService } from './legal-lookup.service';

const E = ErrorCode;

/**
 * Owner 2026-10-20: the government-request workspace — find an account,
 * read its card, queue an evidence archive, download it, freeze data.
 * super_admin only (the `data_requests` area also closes it to no-PII
 * admins); the writes need a fresh step-up; every call is an audit row.
 */
@ApiTags('admin-data-requests')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/data-requests/legal')
export class AdminLegalExportController {
  constructor(
    private readonly lookup: LegalLookupService,
    private readonly exports: LegalExportService,
    private readonly audit: AuditLogService,
    // Via a port, not an import of the privacy module (module-boundaries).
    @Inject(ERASURE_RECORDS) private readonly erasure: ErasureRecords,
  ) {}

  @Get('lookup')
  @Justification()
  @ApiOperation({
    summary: 'Find an account: phone, e-mail, @username, name, id',
  })
  @ApiEnvelopeResponse(LegalLookupHitDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async find(
    @CurrentAdmin() admin: AdminActor,
    @Query() query: LegalLookupQueryDto,
  ): Promise<LegalLookupHitDto[]> {
    const hits = await this.lookup.search(query.q);
    await this.audit.record({
      adminId: admin.id,
      action: LEGAL_AUDIT.lookup,
      targetType: 'user',
      targetId: null,
      after: { query: query.q, hits: hits.length },
      ip: admin.ip,
      justification: admin.justification,
    });
    return hits;
  }

  @Get('users/:userId')
  @Justification()
  @ApiOperation({
    summary: 'Account card: profile, handles, chats, groups, devices',
  })
  @ApiEnvelopeResponse(LegalAccountCardDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async account(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalUserParamDto,
  ): Promise<LegalAccountCardDto> {
    const card = await this.lookup.card(params.userId);
    await this.audit.record({
      adminId: admin.id,
      action: LEGAL_AUDIT.card,
      targetType: 'user',
      targetId: params.userId,
      ip: admin.ip,
      justification: admin.justification,
    });
    return card;
  }

  @Get('erasure/:userId')
  @Justification()
  @ApiOperation({
    summary: 'Account erasure record and certificate (per-store results)',
  })
  @ApiEnvelopeResponse(ErasureRecordDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async erasureRecord(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalUserParamDto,
  ): Promise<ErasureRecordDto> {
    const record = await this.erasure.certificateOf(params.userId);
    if (!record) {
      throw new NotFoundException({
        code: E.NOT_FOUND,
        message: 'No erasure record for this account',
      });
    }
    await this.audit.record({
      adminId: admin.id,
      action: LEGAL_AUDIT.card,
      targetType: 'user',
      targetId: params.userId,
      after: { erasure: record.status },
      ip: admin.ip,
      justification: admin.justification,
    });
    return {
      status: record.status,
      stores: record.stores,
      certificate: record.certificate as Record<string, unknown> | null,
    };
  }

  @Get('requests/:requestId/exports')
  @ApiOperation({ summary: 'Archives of a request, newest first' })
  @ApiEnvelopeResponse(LegalExportDto, { isArray: true })
  listExports(
    @Param() params: LegalRequestParamDto,
  ): Promise<LegalExportDto[]> {
    return this.exports.list(params.requestId);
  }

  @Post('requests/:requestId/exports')
  @HttpCode(HttpStatus.CREATED)
  @Justification()
  @ApiOperation({
    summary: 'Queue an evidence archive (step-up; the worker builds it)',
  })
  @ApiEnvelopeResponse(LegalExportDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  queueExport(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalRequestParamDto,
    @Body() dto: CreateLegalExportDto,
  ): Promise<LegalExportDto> {
    return this.exports.queue(admin, params.requestId, dto);
  }

  @Post('exports/:exportId/download')
  @HttpCode(HttpStatus.OK)
  @Justification()
  @ApiOperation({
    summary: 'Five-minute signed link to the ZIP (step-up, audited)',
  })
  @ApiEnvelopeResponse(LegalDownloadDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  download(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalExportParamDto,
  ): Promise<LegalDownloadDto> {
    return this.exports.download(admin, params.exportId);
  }

  @Get('requests/:requestId/holds')
  @ApiOperation({ summary: 'Legal holds of a request' })
  @ApiEnvelopeResponse(LegalHoldDto, { isArray: true })
  listHolds(@Param() params: LegalRequestParamDto): Promise<LegalHoldDto[]> {
    return this.exports.listHolds(params.requestId);
  }

  @Post('requests/:requestId/holds')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Freeze a person / chat / group (step-up); stops the 90-day scrub',
  })
  @ApiEnvelopeResponse(LegalHoldDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  createHold(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalRequestParamDto,
    @Body() dto: CreateLegalHoldDto,
  ): Promise<LegalHoldDto> {
    return this.exports.createHold(admin, params.requestId, dto);
  }

  @Delete('holds/:holdId')
  @ApiOperation({ summary: 'Release a hold (step-up)' })
  @ApiEnvelopeResponse(LegalHoldDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  releaseHold(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalHoldParamDto,
  ): Promise<LegalHoldDto> {
    return this.exports.releaseHold(admin, params.holdId);
  }
}
