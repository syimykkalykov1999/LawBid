import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CsamReport, MediaModerationCheck } from '@prisma/client';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  CsamAuditEventDto,
  CsamReportDto,
  MediaCheckDto,
  MediaCheckIdParamDto,
  MediaCheckPageDto,
  MediaDecisionDto,
  MediaModerationQueryDto,
  type MediaHiddenTargetDto,
  type MediaLabelDto,
} from './admin-media-moderation.dto';
import { MediaModerationService } from './media-moderation.service';

const E = ErrorCode;

/** Owner 2026-10-22 (audit #4 §5): Модерация → Медиа — pictures the
 * automated check hid or flagged, approve / remove, report to NCMEC. */
@ApiTags('admin-media-moderation')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/media-moderation')
export class AdminMediaModerationController {
  constructor(private readonly service: MediaModerationService) {}

  @Get()
  @ApiOperation({ summary: 'Flagged / hidden / CSAM / unchecked pictures' })
  @ApiEnvelopeResponse(MediaCheckPageDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async listMediaChecks(
    @Query() query: MediaModerationQueryDto,
  ): Promise<MediaCheckPageDto> {
    const page = await this.service.list(query);
    return {
      items: await Promise.all(page.items.map((c) => this.present(c))),
      nextCursor: page.nextCursor,
    };
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'approve (restore what was hidden) or remove' })
  @ApiEnvelopeResponse(MediaCheckDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.MODERATION_ACTION_NOT_APPLICABLE],
  })
  async decideMediaCheck(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: MediaCheckIdParamDto,
    @Body() dto: MediaDecisionDto,
  ): Promise<MediaCheckDto> {
    return this.present(
      await this.service.decide(admin.id, params.id, dto.decision),
    );
  }

  @Post(':id/csam-report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Hide everywhere, keep the evidence and open an NCMEC CyberTipline report',
  })
  @ApiEnvelopeResponse(CsamReportDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async reportMediaCheckCsam(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: MediaCheckIdParamDto,
  ): Promise<CsamReportDto> {
    const r: CsamReport = await this.service.reportCsam(admin.id, params.id);
    return {
      id: r.id,
      checkId: r.check_id,
      status: r.status,
      externalReportId: r.external_report_id,
      error: r.error,
      audit: (r.audit as unknown as CsamAuditEventDto[]) ?? [],
      createdAt: r.created_at.toISOString(),
    };
  }

  private async present(c: MediaModerationCheck): Promise<MediaCheckDto> {
    return {
      id: c.id,
      fileId: c.file_id,
      videoAssetId: c.video_asset_id,
      ownerUserId: c.owner_user_id,
      purpose: c.purpose,
      status: c.status,
      csamStatus: c.csam_status,
      provider: c.provider,
      labels: (c.labels as unknown as MediaLabelDto[]) ?? [],
      maxConfidence: c.max_confidence,
      topLabel: c.top_label,
      skipReason: c.skip_reason,
      hiddenTargets:
        (c.hidden_targets as unknown as MediaHiddenTargetDto[]) ?? [],
      decision: c.decision,
      previewUrl: await this.service.previewUrl(c),
      createdAt: c.created_at.toISOString(),
      checkedAt: c.checked_at?.toISOString() ?? null,
    };
  }
}
