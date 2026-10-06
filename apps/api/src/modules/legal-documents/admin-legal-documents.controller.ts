import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  ALL_ADMIN_ROLES,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminLegalDocumentDetailDto,
  AdminLegalDocumentRowDto,
  AdminLegalVersionDto,
  LegalDocLocaleParamDto,
  LegalDocTypeParamDto,
  LegalVersionIdParamDto,
  PublishLegalDto,
  SaveLegalDraftDto,
} from './legal-documents.dto';
import { LegalDocumentsService } from './legal-documents.service';

/**
 * Owner 2026-10-05 (legal documents): Система → Юридические документы.
 * Under `/admin/legal/`, so the `legal` area toggle (view / manage) applies:
 * managers of the area edit drafts, only the super admin publishes and
 * rolls back. The service writes its own audit rows.
 */
@ApiTags('admin-legal')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/legal/documents')
export class AdminLegalDocumentsController {
  constructor(private readonly docs: LegalDocumentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Every legal document by type with the state of each language',
  })
  @ApiEnvelopeResponse(AdminLegalDocumentRowDto, { isArray: true })
  listAdminLegalDocuments(): Promise<AdminLegalDocumentRowDto[]> {
    return this.docs.list();
  }

  @Get('version/:id')
  @ApiOperation({ summary: 'One version with the full text' })
  @ApiEnvelopeResponse(AdminLegalVersionDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getAdminLegalVersion(
    @Param() params: LegalVersionIdParamDto,
  ): Promise<AdminLegalVersionDto> {
    return this.docs.versionById(params.id);
  }

  @Post('version/:id/rollback')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Rollback (super admin): publish an old version’s text as a new version; nothing is deleted',
  })
  @ApiEnvelopeResponse(AdminLegalVersionDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.LEGAL_DOCUMENT_INVALID_STATE],
  })
  rollbackAdminLegalVersion(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalVersionIdParamDto,
    @Body() dto: PublishLegalDto,
  ): Promise<AdminLegalVersionDto> {
    return this.docs.rollback(admin, params.id, dto);
  }

  @Get(':type')
  @ApiOperation({
    summary: 'Current version and draft of both languages, with the texts',
  })
  @ApiEnvelopeResponse(AdminLegalDocumentDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  getAdminLegalDocument(
    @Param() params: LegalDocTypeParamDto,
  ): Promise<AdminLegalDocumentDetailDto> {
    return this.docs.detail(params.type);
  }

  @Get(':type/:locale/history')
  @ApiOperation({
    summary: 'Published and archived versions, newest first (no texts)',
  })
  @ApiEnvelopeResponse(AdminLegalVersionDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  getAdminLegalHistory(
    @Param() params: LegalDocLocaleParamDto,
  ): Promise<AdminLegalVersionDto[]> {
    return this.docs.history(params.type, params.locale);
  }

  @Put(':type/:locale/draft')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Create or replace the draft (Markdown)' })
  @ApiEnvelopeResponse(AdminLegalVersionDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  saveAdminLegalDraft(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalDocLocaleParamDto,
    @Body() dto: SaveLegalDraftDto,
  ): Promise<AdminLegalVersionDto> {
    return this.docs.saveDraft(admin, params.type, params.locale, dto);
  }

  @Delete(':type/:locale/draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Throw the draft away (published versions stay)' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  discardAdminLegalDraft(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalDocLocaleParamDto,
  ): Promise<void> {
    return this.docs.discardDraft(admin, params.type, params.locale);
  }

  @Post(':type/:locale/publish')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Publish the draft (super admin): next version number, the previous one is archived; optionally asks users to accept again',
  })
  @ApiEnvelopeResponse(AdminLegalVersionDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    409: [E.LEGAL_DOCUMENT_INVALID_STATE],
  })
  publishAdminLegalDocument(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: LegalDocLocaleParamDto,
    @Body() dto: PublishLegalDto,
  ): Promise<AdminLegalVersionDto> {
    return this.docs.publish(admin, params.type, params.locale, dto);
  }
}
