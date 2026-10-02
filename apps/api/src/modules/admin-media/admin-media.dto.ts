import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const VIDEO_STATUSES = [
  'awaiting_upload',
  'processing',
  'ready',
  'failed',
  'rejected',
  'deleted',
] as const;
export type AdminVideoStatus = (typeof VIDEO_STATUSES)[number];

class CursorQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdminMediaIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminStickerParamDto extends AdminMediaIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  stickerId!: string;
}

export class AdminMediaReasonDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

// --- videos (reels) -------------------------------------------------------------

export class AdminVideosQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: VIDEO_STATUSES, enumName: 'AdminVideoStatus' })
  @IsOptional()
  @IsIn(VIDEO_STATUSES)
  status?: AdminVideoStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  ownerId?: string;
}

export class AdminVideoRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: VIDEO_STATUSES }) status!: string;
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty() ownerName!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  postId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['published', 'hidden', 'removed', 'processing'],
    description: "The linked post's status (removed if deleted).",
  })
  postStatus!: string | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  durationSec!: number | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  sizeBytes!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  failureReason!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Signed HLS link (ready videos while video is configured).',
  })
  playbackUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnailUrl!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  readyAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;
}

export class AdminVideoStatusCountDto {
  @ApiProperty({ enum: VIDEO_STATUSES }) status!: string;
  @ApiProperty({ type: 'integer' }) count!: number;
}

export class AdminVideoStatsDto {
  @ApiProperty({ type: [AdminVideoStatusCountDto] })
  byStatus!: AdminVideoStatusCountDto[];
  @ApiProperty({
    type: 'integer',
    description: 'Bunny storage of live ready videos, bytes.',
  })
  storageBytes!: number;
  @ApiProperty({ type: 'integer' }) uploads7d!: number;
  @ApiProperty({ type: 'integer' }) failed7d!: number;
}

// --- stickers -------------------------------------------------------------------

export class AdminStickerPacksQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: ['official', 'user'] })
  @IsOptional()
  @IsIn(['official', 'user'])
  kind?: 'official' | 'user';

  @ApiPropertyOptional({ enum: ['active', 'hidden'] })
  @IsOptional()
  @IsIn(['active', 'hidden'])
  status?: 'active' | 'hidden';

  @ApiPropertyOptional({ description: 'Title or short name.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  q?: string;
}

export class AdminStickerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() emoji!: string;
  @ApiProperty({ type: 'integer' }) position!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Null while the image is being checked.',
  })
  url!: string | null;
}

export class AdminStickerPackRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() shortName!: string;
  @ApiProperty() isOfficial!: boolean;
  @ApiProperty({ enum: ['active', 'hidden'] }) status!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  ownerId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  ownerName!: string | null;
  @ApiProperty({ type: 'integer' }) stickerCount!: number;
  @ApiProperty({ type: 'integer' }) installCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminStickerPackDto extends AdminStickerPackRowDto {
  @ApiProperty({ type: [AdminStickerDto] }) stickers!: AdminStickerDto[];
}

export class CreateOfficialStickerPackDto {
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  title!: string;

  @ApiPropertyOptional({
    description:
      'Share name (lawbid.app/stickers/<shortName>); generated if omitted.',
    pattern: '^[A-Za-z][A-Za-z0-9_]{2,39}$',
  })
  @IsOptional()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{2,39}$/)
  shortName?: string;
}

export class AddOfficialStickerDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'A clean `sticker` file uploaded through POST /admin/media/sticker-uploads.',
  })
  @IsUUID('all')
  fileId!: string;

  @ApiPropertyOptional({ maxLength: 16, example: '👍' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(16)
  emoji?: string;
}

/** The `sticker` purpose's types (files.policy.ts). */
export const STICKER_MIMES = [
  'image/png',
  'image/webp',
  'image/jpeg',
  'image/gif',
] as const;

export class AdminStickerUploadDto {
  @ApiProperty({ enum: STICKER_MIMES })
  @IsIn(STICKER_MIMES)
  mime!: (typeof STICKER_MIMES)[number];

  @ApiProperty({
    minimum: 1,
    description: 'Bytes; the `files.sticker_max_size_mb` setting applies.',
  })
  @IsInt()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  sizeBytes!: number;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string;
}

export class AdminFileIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  fileId!: string;
}
