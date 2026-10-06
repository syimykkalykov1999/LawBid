import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/** Owner 2026-10-05: Система → Хранилище — every switch is on by default. */
export class StorageSettingsDto {
  @ApiProperty({ description: 'Identical uploads share one stored copy.' })
  dedup!: boolean;
  @ApiProperty({ description: 'Files nobody uses are removed by themselves.' })
  autoCleanup!: boolean;
  @ApiProperty({ minimum: 1, maximum: 720 }) orphanGraceHours!: number;
  @ApiProperty({ minimum: 0, maximum: 90 }) purgeAfterDays!: number;
  @ApiProperty({ minimum: 1, maximum: 365 }) deletedPostsMediaDays!: number;
  @ApiProperty({ enum: ['webp', 'jpeg'], enumName: 'StorageImageFormat' })
  imageFormat!: 'webp' | 'jpeg';
  @ApiProperty({ description: 'MB per user; 0 = no cap.' })
  userQuotaMb!: number;
  @ApiProperty({ description: 'MB of files per chat; 0 = no cap.' })
  chatQuotaMb!: number;
  @ApiProperty({ description: 'Old technical logs are removed nightly.' })
  autoRetention!: boolean;
  @ApiProperty({ description: 'Days; 0 = keep forever.' })
  retentionAuthEventsDays!: number;
  @ApiProperty({ description: 'Days; 0 = keep forever.' })
  retentionAssistantActivityDays!: number;
  @ApiProperty({ description: 'Days a notification is kept.' })
  notificationsRetentionDays!: number;
  @ApiProperty({ description: 'Alert when storage grows this % in a day.' })
  growthAlertPercent!: number;
}

export class UpdateStorageSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dedup?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoCleanup?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 720 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  orphanGraceHours?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  purgeAfterDays?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  deletedPostsMediaDays?: number;
  @ApiPropertyOptional({
    enum: ['webp', 'jpeg'],
    enumName: 'StorageImageFormat',
  })
  @IsOptional()
  @IsIn(['webp', 'jpeg'])
  imageFormat?: 'webp' | 'jpeg';
  @ApiPropertyOptional({ minimum: 0, maximum: 1_048_576 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_048_576)
  userQuotaMb?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1_048_576 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_048_576)
  chatQuotaMb?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRetention?: boolean;
  @ApiPropertyOptional({ minimum: 0, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  retentionAuthEventsDays?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  retentionAssistantActivityDays?: number;
  @ApiPropertyOptional({ minimum: 7, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(3650)
  notificationsRetentionDays?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  growthAlertPercent?: number;
}

export class StoragePurposeUsageDto {
  @ApiProperty() purpose!: string;
  @ApiProperty() count!: number;
  @ApiProperty() bytes!: number;
}

export class StorageTableUsageDto {
  @ApiProperty() table!: string;
  @ApiProperty() rows!: number;
  @ApiProperty() bytes!: number;
}

export class StorageUserUsageDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty() bytes!: number;
  @ApiProperty() count!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Personal cap in MB; null = the default.',
  })
  quotaMb!: number | null;
}

export class StorageHistoryPointDto {
  @ApiProperty({ example: '2026-10-05' }) day!: string;
  @ApiProperty() filesBytes!: number;
  @ApiProperty() storedBytes!: number;
  @ApiProperty() dbBytes!: number;
  @ApiProperty() filesCount!: number;
}

export class StorageCleanupResultDto {
  @ApiProperty() pendingUploadsRemoved!: number;
  @ApiProperty() orphansFound!: number;
  @ApiProperty() deletedPostMedia!: number;
  @ApiProperty() restored!: number;
  @ApiProperty() objectsRemoved!: number;
  @ApiProperty() rowsRemoved!: number;
}

export class StorageLastCleanupDto extends StorageCleanupResultDto {
  @ApiProperty({ format: 'date-time' }) at!: string;
}

export class StorageOverviewDto {
  @ApiProperty({ description: 'Live files as users see them.' })
  filesBytes!: number;
  @ApiProperty() filesCount!: number;
  @ApiProperty({ description: 'What S3 keeps (shared copies once).' })
  storedBytes!: number;
  @ApiProperty({ description: 'filesBytes − storedBytes.' })
  dedupSavedBytes!: number;
  @ApiProperty() pendingRemovalCount!: number;
  @ApiProperty() pendingRemovalBytes!: number;
  @ApiProperty({ type: [StoragePurposeUsageDto] })
  byPurpose!: StoragePurposeUsageDto[];
  @ApiProperty({ type: [StorageTableUsageDto] })
  tables!: StorageTableUsageDto[];
  @ApiProperty({ type: [StorageUserUsageDto] })
  topUsers!: StorageUserUsageDto[];
  @ApiProperty({ type: [StorageHistoryPointDto] })
  history!: StorageHistoryPointDto[];
  @ApiProperty({ type: StorageLastCleanupDto, nullable: true })
  lastCleanup!: StorageLastCleanupDto | null;
  @ApiProperty({ type: StorageSettingsDto }) settings!: StorageSettingsDto;
}

export class StorageUserIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class SetUserStorageQuotaDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    description: 'MB; 0 = no cap, null = back to the default.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1_048_576)
  quotaMb!: number | null;
}

export class UserStorageQuotaDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: Number, nullable: true }) quotaMb!: number | null;
  @ApiProperty() usedBytes!: number;
  @ApiProperty({ type: Number, nullable: true }) quotaBytes!: number | null;
}
