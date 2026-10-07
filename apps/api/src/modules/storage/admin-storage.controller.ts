import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';

import { FilesService } from '../files/files.service';
import {
  PLACE_SPECS,
  UPLOAD_LIMITS_KEY,
  UPLOAD_PLACES,
  sanitizeUploadLimits,
  type UploadLimits,
} from '../files/upload-limits';
import {
  SetUserStorageQuotaDto,
  StorageCleanupResultDto,
  StorageOverviewDto,
  StorageSettingsDto,
  StorageUserIdParamDto,
  UpdateStorageSettingsDto,
  UserStorageQuotaDto,
} from './admin-storage.dto';
import {
  UpdateUploadSettingsDto,
  UploadSettingsDto,
} from './admin-uploads.dto';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageStatsService } from './storage-stats.service';

const E = ErrorCode;

/**
 * Owner 2026-10-05: Система → «Хранилище» (area `settings`: view reads,
 * manage changes). What files and the database take, what deduplication
 * saved, what is waiting to be removed, the automatic cleanup / retention
 * switches (all on by default) and a «clean up now» button.
 */
@ApiTags('admin-storage')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/storage')
export class AdminStorageController {
  constructor(
    private readonly stats: StorageStatsService,
    private readonly cleanup: StorageCleanupService,
    private readonly settings: AppSettingsService,
    private readonly writer: AppSettingsWriter,
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Storage: usage, savings, growth, settings' })
  @ApiEnvelopeResponse(StorageOverviewDto)
  async getStorageOverview(): Promise<StorageOverviewDto> {
    const [usage, tables, topUsers, history, lastCleanup, settings] =
      await Promise.all([
        this.stats.usage(),
        this.stats.tables(),
        this.stats.topUsers(),
        this.stats.history(),
        this.cleanup.lastRun(),
        this.readSettings(),
      ]);
    return {
      filesBytes: usage.filesBytes,
      filesCount: usage.filesCount,
      storedBytes: usage.storedBytes,
      dedupSavedBytes: Math.max(0, usage.filesBytes - usage.storedBytes),
      pendingRemovalCount: usage.pendingRemovalCount,
      pendingRemovalBytes: usage.pendingRemovalBytes,
      byPurpose: usage.byPurpose,
      tables,
      topUsers,
      history,
      lastCleanup,
      settings,
    };
  }

  @Put('settings')
  @ApiOperation({ summary: 'Change the storage switches and limits' })
  @ApiEnvelopeResponse(StorageSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async updateStorageSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateStorageSettingsDto,
  ): Promise<StorageSettingsDto> {
    await this.writer.write(admin.id, 'storage.settings.update', {
      'storage.dedup': dto.dedup,
      'storage.auto_cleanup': dto.autoCleanup,
      'storage.orphan_grace_hours': dto.orphanGraceHours,
      'storage.purge_after_days': dto.purgeAfterDays,
      'storage.deleted_posts_media_days': dto.deletedPostsMediaDays,
      'storage.image_format': dto.imageFormat,
      'storage.user_quota_mb': dto.userQuotaMb,
      'storage.chat_quota_mb': dto.chatQuotaMb,
      'storage.auto_retention': dto.autoRetention,
      'storage.retention_auth_events_days': dto.retentionAuthEventsDays,
      'storage.retention_assistant_activity_days':
        dto.retentionAssistantActivityDays,
      'notifications.retention_days': dto.notificationsRetentionDays,
      'storage.growth_alert_percent': dto.growthAlertPercent,
    });
    return this.readSettings();
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the cleanup now (unused files, abandoned uploads)',
  })
  @ApiEnvelopeResponse(StorageCleanupResultDto)
  runStorageCleanup(): Promise<StorageCleanupResultDto> {
    return this.cleanup.runNow();
  }

  /** Owner 2026-10-07 (bug 17): Система → «Загрузки и файлы». */
  @Get('uploads')
  @ApiOperation({ summary: 'Upload limits and file formats per place' })
  @ApiEnvelopeResponse(UploadSettingsDto)
  async getUploadSettings(): Promise<UploadSettingsDto> {
    return this.uploadSettings(await this.files.uploadLimits());
  }

  /** Values outside the ceilings are clamped and formats outside a
   * place's safe list are dropped — nothing unsafe can be turned on. */
  @Put('uploads')
  @ApiOperation({ summary: 'Change upload limits and file formats' })
  @ApiEnvelopeResponse(UploadSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async updateUploadSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateUploadSettingsDto,
  ): Promise<UploadSettingsDto> {
    const current = await this.files.uploadLimits();
    const next: Record<string, unknown> = { ...current };
    for (const p of dto.places) {
      const { place, ...limits } = p;
      next[place] = limits;
    }
    const clean = sanitizeUploadLimits(next);
    await this.writer.write(admin.id, 'uploads.limits.update', {
      [UPLOAD_LIMITS_KEY]: clean as unknown as Prisma.InputJsonValue,
    });
    return this.uploadSettings(clean);
  }

  @Put('users/:id/quota')
  @ApiOperation({ summary: "Set or clear one user's storage cap" })
  @ApiEnvelopeResponse(UserStorageQuotaDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async setUserStorageQuota(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StorageUserIdParamDto,
    @Body() dto: SetUserStorageQuotaDto,
  ): Promise<UserStorageQuotaDto> {
    const before = await this.prisma.user.findUnique({
      where: { id: p.id },
      select: { storage_quota_mb: true },
    });
    if (!before) {
      throw new NotFoundException({
        code: E.NOT_FOUND,
        message: 'User not found.',
      });
    }
    await this.prisma.user.update({
      where: { id: p.id },
      data: { storage_quota_mb: dto.quotaMb },
    });
    await this.audit.record({
      adminId: admin.id,
      action: 'storage.user_quota.set',
      targetType: 'user',
      targetId: p.id,
      before: { quotaMb: before.storage_quota_mb },
      after: { quotaMb: dto.quotaMb },
    });
    const usage = await this.files.usage(p.id);
    return { userId: p.id, quotaMb: dto.quotaMb, ...usage };
  }

  private uploadSettings(limits: UploadLimits): UploadSettingsDto {
    return {
      places: UPLOAD_PLACES.map((place) => {
        const spec = PLACE_SPECS[place];
        return {
          limits: { place, ...limits[place] },
          count: spec.count,
          safeFormats: [...spec.safeFormats],
          ceiling: { ...spec.ceiling },
          defaults: { place, ...spec.defaults },
        };
      }),
    };
  }

  private async readSettings(): Promise<StorageSettingsDto> {
    const s = this.settings;
    const [
      dedup,
      autoCleanup,
      orphanGraceHours,
      purgeAfterDays,
      deletedPostsMediaDays,
      imageFormat,
      userQuotaMb,
      chatQuotaMb,
      autoRetention,
      retentionAuthEventsDays,
      retentionAssistantActivityDays,
      notificationsRetentionDays,
      growthAlertPercent,
    ] = await Promise.all([
      s.boolean('storage.dedup'),
      s.boolean('storage.auto_cleanup'),
      s.number('storage.orphan_grace_hours'),
      s.number('storage.purge_after_days'),
      s.number('storage.deleted_posts_media_days'),
      s.string('storage.image_format'),
      s.number('storage.user_quota_mb'),
      s.number('storage.chat_quota_mb'),
      s.boolean('storage.auto_retention'),
      s.number('storage.retention_auth_events_days'),
      s.number('storage.retention_assistant_activity_days'),
      s.number('notifications.retention_days'),
      s.number('storage.growth_alert_percent'),
    ]);
    return {
      dedup,
      autoCleanup,
      orphanGraceHours,
      purgeAfterDays,
      deletedPostsMediaDays,
      imageFormat: imageFormat === 'jpeg' ? 'jpeg' : 'webp',
      userQuotaMb,
      chatQuotaMb,
      autoRetention,
      retentionAuthEventsDays,
      retentionAssistantActivityDays,
      notificationsRetentionDays,
      growthAlertPercent,
    };
  }
}
