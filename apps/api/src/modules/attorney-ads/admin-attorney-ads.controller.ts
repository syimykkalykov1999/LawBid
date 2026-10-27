import { Body, Controller, Get, Put, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AdminAttorneyAdsService } from './admin-attorney-ads.service';
import {
  AdArchiveQueryDto,
  AdArchiveRowDto,
  AdRuleDto,
  AttorneyAdsSettingsDto,
  UpdateAttorneyAdsSettingsDto,
} from './attorney-ads.dto';
import type { AttorneyAdsSettings } from './attorney-ads.settings';

const E = ErrorCode;

/** Owner 2026-10-28: Реклама адвокатов — per-state rules, the content
 * checker's rule list and the archive (super admin; legal reads). */
@ApiTags('admin-attorney-ads')
@AdminEndpoint('super_admin', 'moderator', 'support')
@Controller('admin/attorney-ads')
export class AdminAttorneyAdsController {
  constructor(
    private readonly ads: AdminAttorneyAdsService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Per-state advertising rules' })
  @ApiEnvelopeResponse(AttorneyAdsSettingsDto)
  getAttorneyAdsSettings(): Promise<AttorneyAdsSettings> {
    return this.ads.getSettings();
  }

  @Roles('super_admin')
  @Put('settings')
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Change the per-state advertising rules (super admin, fresh 2FA code)',
  })
  @ApiEnvelopeResponse(AttorneyAdsSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async updateAttorneyAdsSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateAttorneyAdsSettingsDto,
  ): Promise<AttorneyAdsSettings> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.ads.updateSettings(admin, dto);
  }

  @Get('rules')
  @ApiOperation({ summary: 'The content checker rule catalogue' })
  @ApiEnvelopeResponse(AdRuleDto, { isArray: true })
  listAttorneyAdRules(): AdRuleDto[] {
    return this.ads.rules();
  }

  @Get('archive')
  @ApiOperation({ summary: 'Archived versions of attorney ads' })
  @ApiEnvelopeResponse(AdArchiveRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAttorneyAdArchive(
    @Query() q: AdArchiveQueryDto,
  ): Promise<{ items: AdArchiveRowDto[]; nextCursor: string | null }> {
    return this.ads.list(q);
  }

  @Roles('super_admin')
  @Get('archive/export')
  @ApiOperation({
    summary: 'CSV export of the ad archive (up to 5 000 rows; audited)',
  })
  @ApiProduces('text/csv')
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async exportAttorneyAdArchive(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: AdArchiveQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.ads.exportCsv(admin, q);
    const day = new Date().toISOString().slice(0, 10);
    res
      .type('text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="lawbid-attorney-ads-${day}.csv"`,
      )
      .send(csv);
  }
}
