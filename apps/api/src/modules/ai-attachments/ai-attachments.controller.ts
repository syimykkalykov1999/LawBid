import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AdminConfigService } from '../admin-config/admin-config.service';
import { FileDto, PresignedFileDto } from '../files/files.public';
import { FilesService } from '../files/files.service';
import {
  AiImageFileParamDto,
  AiImageUploadDto,
  AiPurgedDto,
  AiRetentionDto,
  PurgeAiRetentionDto,
  UpdateAiRetentionDto,
} from './ai-attachments.dto';
import {
  AI_RETENTION_IMAGES_KEY,
  AI_RETENTION_RECORDS_KEY,
} from './ai-attachments.logic';
import { AiRetentionService } from './ai-retention.service';

/**
 * Owner-only, the same as «ИИ-сотрудник» / «ИИ-техник»: the guard lets only
 * super_admin in, and the trusted deputy who may READ owner pages is refused
 * here too.
 */
export function ownerOnly(admin: Pick<AdminActor, 'adminRole'>): void {
  if (admin.adminRole !== 'super_admin') {
    throw new ForbiddenException({
      code: E.FORBIDDEN,
      message: 'Только владелец.',
    });
  }
}

/**
 * Owner 2026-11-12 (rows 48, 49): the owner's screenshots and photos for the
 * AI technician and the AI employee, and how long what the AI makes is kept.
 * Uploads use the files pipeline unchanged (presign → the browser POSTs to
 * the private bucket → confirm: magic bytes, antivirus, re-encode without
 * EXIF / GPS). Every change needs a fresh 2FA step-up.
 */
@ApiTags('admin-ai-attachments')
@AdminEndpoint('super_admin')
@Controller('admin/ai-attachments')
export class AiAttachmentsController {
  constructor(
    private readonly files: FilesService,
    private readonly auth: AdminAuthService,
    private readonly config: AdminConfigService,
    private readonly retention: AiRetentionService,
    private readonly audit: AuditLogService,
  ) {}

  // flag: none owner only, fresh 2FA
  @Post('uploads')
  @ApiOperation({
    summary:
      'Step 1 of an image for an AI: presigned POST (then POST the file to S3)',
  })
  @ApiEnvelopeResponse(PresignedFileDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.FILE_TYPE_NOT_ALLOWED, E.FILE_TOO_LARGE],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    503: [E.FILE_STORAGE_UNAVAILABLE],
  })
  async presignAiImage(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AiImageUploadDto,
  ): Promise<PresignedFileDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    return this.files.presign(
      admin.id,
      { purpose: 'ai_attachment', ...dto },
      { byAdmin: true },
    );
  }

  // flag: none owner only
  @Post('uploads/:fileId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Step 2: check the uploaded image (real type by its bytes, then antivirus)',
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
  })
  confirmAiImage(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AiImageFileParamDto,
  ): Promise<FileDto> {
    ownerOnly(admin);
    return this.files.confirm(admin.id, p.fileId);
  }

  // flag: none owner only
  @Get('retention')
  @ApiOperation({ summary: 'AI pages: how many days records and images stay' })
  @ApiEnvelopeResponse(AiRetentionDto)
  getAiRetention(@CurrentAdmin() admin: AdminActor): Promise<AiRetentionDto> {
    ownerOnly(admin);
    return this.retention.days();
  }

  // flag: none owner only, fresh 2FA (the app_config change is audited)
  @Patch('retention')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'AI pages: «Хранить N дней» (0 = keep forever)' })
  @ApiEnvelopeResponse(AiRetentionDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async updateAiRetention(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateAiRetentionDto,
  ): Promise<AiRetentionDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    await this.config.updateConfig(
      admin,
      dto.what === 'records'
        ? AI_RETENTION_RECORDS_KEY
        : AI_RETENTION_IMAGES_KEY,
      dto.days,
    );
    return this.retention.days();
  }

  // flag: none owner only, fresh 2FA; one audit row with what was removed
  @Post('retention/purge')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'AI pages: «Очистить сейчас» (undecided and pending items always stay)',
  })
  @ApiEnvelopeResponse(AiPurgedDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async purgeAiRetention(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: PurgeAiRetentionDto,
  ): Promise<AiPurgedDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    const done = await this.retention.purgeNow(dto.mode, dto.scope);
    await this.audit.record({
      adminId: admin.id,
      action: 'ai.retention_purge',
      targetType: 'system',
      targetId: null,
      before: { mode: dto.mode, scope: dto.scope },
      after: { ...done },
      ip: admin.ip ?? null,
    });
    return done;
  }
}
