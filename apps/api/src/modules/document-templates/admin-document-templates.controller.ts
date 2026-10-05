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
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminBulkResultDto } from '../admin-content/admin-content.dto';
import { eachId } from '../admin-content/bulk.util';
import { FileDto, PresignedFileDto } from '../files/dto/files.dto';
import {
  AdminDocumentTemplateDto,
  AdminTemplateFileParamDto,
  AdminTemplateUploadDto,
  AdminTemplatesBulkDto,
  AdminTemplatesQueryDto,
  CreateDocumentTemplateDto,
  TemplateIdParamDto,
  UpdateDocumentTemplateDto,
} from './document-templates.dto';
import { DocumentTemplatesService } from './document-templates.service';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-10-05 — admin panel → Content → Document templates:
 * super_admin and moderators. Mutations write their own audit rows. */
@ApiTags('admin-document-templates')
@AdminEndpoint('super_admin', 'moderator')
@SkipAutoAudit()
@Controller('admin/document-templates')
export class AdminDocumentTemplatesController {
  constructor(
    private readonly templates: DocumentTemplatesService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Templates (drafts and published), newest first' })
  @ApiEnvelopeResponse(AdminDocumentTemplateDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminDocumentTemplates(
    @Query() q: AdminTemplatesQueryDto,
  ): Promise<Page<AdminDocumentTemplateDto>> {
    return this.templates.adminList(q);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Create a template from an uploaded (clean) file' })
  @ApiEnvelopeResponse(AdminDocumentTemplateDto, {
    status: HttpStatus.CREATED,
  })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.FILE_NOT_ATTACHABLE, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  createAdminDocumentTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateDocumentTemplateDto,
  ): Promise<AdminDocumentTemplateDto> {
    return this.templates.create(admin, dto);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish, unpublish or delete many templates' })
  @ApiEnvelopeResponse(AdminBulkResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async bulkAdminDocumentTemplates(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminTemplatesBulkDto,
  ): Promise<AdminBulkResultDto> {
    const result = await eachId(dto.ids, (id) =>
      dto.action === 'delete'
        ? this.templates.remove(admin, id)
        : this.templates.setPublished(admin, id, dto.action === 'publish'),
    );
    await this.audit.record({
      adminId: admin.id,
      action: `admin.document_template.bulk_${dto.action}`,
      targetType: 'document_template',
      targetId: null,
      after: {
        requested: dto.ids.length,
        done: result.done,
        skipped: result.skipped.map((s) => ({ id: s.id, reason: s.reason })),
      },
      ip: admin.ip,
    });
    return result;
  }

  @Post('uploads')
  @ApiOperation({
    summary:
      'Step 1 of a template upload (PDF, Word): presigned POST (then POST the file to S3)',
  })
  @ApiEnvelopeResponse(PresignedFileDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.FILE_TYPE_NOT_ALLOWED],
    413: [E.FILE_TOO_LARGE],
    429: [E.RATE_LIMITED],
    503: [E.FILE_STORAGE_UNAVAILABLE],
  })
  presignAdminTemplateUpload(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminTemplateUploadDto,
  ): Promise<PresignedFileDto> {
    return this.templates.presignUpload(admin, dto);
  }

  @Post('uploads/:fileId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Step 2: verify the uploaded file; usable once scanStatus = clean',
  })
  @ApiEnvelopeResponse(FileDto)
  @ApiErrors({
    400: [
      E.VALIDATION_ERROR,
      E.FILE_TYPE_NOT_ALLOWED,
      E.FILE_CHECKSUM_MISMATCH,
    ],
    404: [E.NOT_FOUND],
    409: [E.FILE_NOT_UPLOADED],
    413: [E.FILE_TOO_LARGE],
  })
  confirmAdminTemplateUpload(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminTemplateFileParamDto,
  ): Promise<FileDto> {
    return this.templates.confirmUpload(admin, p.fileId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One template' })
  @ApiEnvelopeResponse(AdminDocumentTemplateDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getAdminDocumentTemplate(
    @Param() p: TemplateIdParamDto,
  ): Promise<AdminDocumentTemplateDto> {
    return this.templates.adminGet(p.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a template (any field, or replace the document)',
  })
  @ApiEnvelopeResponse(AdminDocumentTemplateDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.FILE_NOT_ATTACHABLE],
  })
  updateAdminDocumentTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TemplateIdParamDto,
    @Body() dto: UpdateDocumentTemplateDto,
  ): Promise<AdminDocumentTemplateDto> {
    return this.templates.update(admin, p.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template (copies users made stay)' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  deleteAdminDocumentTemplate(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TemplateIdParamDto,
  ): Promise<void> {
    return this.templates.remove(admin, p.id);
  }
}
