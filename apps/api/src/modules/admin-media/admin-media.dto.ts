import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OWNER_BULK_MAX } from '../../common/admin-bulk/admin-bulk';
import { AdminReasonDto, BULK_MAX } from '../admin-content/admin-content.dto';

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
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
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

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Uploaded at or after (inclusive).',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Uploaded before (exclusive).',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

/** Row 179 B6: the videos list filter of «select all by filter» (no paging). */
export class AdminVideosFilterDto extends OmitType(AdminVideosQueryDto, [
  'cursor',
] as const) {}

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

/** Row 179 B6: the packs list filter of «select all by filter» (no paging). */
export class AdminStickerPacksFilterDto extends OmitType(
  AdminStickerPacksQueryDto,
  ['cursor'] as const,
) {}

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
  @ApiProperty({
    type: 'integer',
    description: 'Stars to add the pack; 0 = free.',
  })
  priceStars!: number;
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

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: 1000000,
    description: 'Stars to add the pack (0 = free, the default).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  priceStars?: number;
}

export class SetStickerPackPriceDto {
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 1000000 })
  @IsInt()
  @Min(0)
  @Max(1000000)
  priceStars!: number;
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

// --- Row 179 B6: «select all by filter» ----------------------------------------

const IDS_DOC = `Exactly one of \`ids\` or \`filter\`. Staff: at most ${BULK_MAX}; the owner: any number (processed in chunks).`;
const FILTER_DOC =
  'Row 179 B6: «select all by filter» — the list filter; the server resolves the ids (staff: at most `admin.bulk_select_cap`) and audits the filter.';

/** Take down many videos: explicit ids or the videos list filter. */
export class AdminVideosBulkDto extends AdminReasonDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: OWNER_BULK_MAX,
    description: IDS_DOC,
  })
  @ValidateIf((o: AdminVideosBulkDto) => o.filter === undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(OWNER_BULK_MAX)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    type: () => AdminVideosFilterDto,
    description: FILTER_DOC,
  })
  @ValidateIf((o: AdminVideosBulkDto) => o.ids === undefined)
  @ValidateNested()
  @Type(() => AdminVideosFilterDto)
  filter?: AdminVideosFilterDto;
}

/** Hide / unhide many packs: explicit ids or the packs list filter. */
export class AdminStickerPacksBulkDto extends AdminReasonDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: OWNER_BULK_MAX,
    description: IDS_DOC,
  })
  @ValidateIf((o: AdminStickerPacksBulkDto) => o.filter === undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(OWNER_BULK_MAX)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    type: () => AdminStickerPacksFilterDto,
    description: FILTER_DOC,
  })
  @ValidateIf((o: AdminStickerPacksBulkDto) => o.ids === undefined)
  @ValidateNested()
  @Type(() => AdminStickerPacksFilterDto)
  filter?: AdminStickerPacksFilterDto;
}

export class AdminVideosBulkPreviewDto {
  @ApiProperty({ type: () => AdminVideosFilterDto })
  // DAST 26.11: a body without filter was a 500 (undefined filter field).
  @IsDefined()
  @ValidateNested()
  @Type(() => AdminVideosFilterDto)
  filter!: AdminVideosFilterDto;
}

export class AdminStickerPacksBulkPreviewDto {
  @ApiProperty({ type: () => AdminStickerPacksFilterDto })
  // DAST 26.11: a body without filter was a 500 (undefined filter field).
  @IsDefined()
  @ValidateNested()
  @Type(() => AdminStickerPacksFilterDto)
  filter!: AdminStickerPacksFilterDto;
}
