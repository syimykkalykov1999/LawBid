import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const VIDEO_ASSET_STATUSES = [
  'awaiting_upload',
  'processing',
  'ready',
  'failed',
  'rejected',
  'deleted',
] as const;
export type VideoAssetStatusValue = (typeof VIDEO_ASSET_STATUSES)[number];

/** POST /videos/uploads — what the phone knows before uploading. */
export class CreateVideoUploadDto {
  @ApiProperty({ type: 'integer', minimum: 1, description: 'File size.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4 * 1024 * 1024 * 1024)
  sizeBytes!: number;

  @ApiProperty({ type: 'integer', minimum: 1, description: 'Seconds.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  durationSec!: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}

/** TUS credentials for one direct upload to Bunny. */
export class VideoUploadDto {
  @ApiProperty({ format: 'uuid' })
  videoAssetId!: string;

  @ApiProperty()
  tusEndpoint!: string;

  @ApiProperty()
  libraryId!: string;

  @ApiProperty()
  videoId!: string;

  @ApiProperty()
  authorizationSignature!: string;

  @ApiProperty({ type: 'integer', description: 'Unix seconds.' })
  authorizationExpire!: number;

  @ApiProperty({ type: 'integer' })
  maxDurationSec!: number;
}

export class VideoAssetDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VIDEO_ASSET_STATUSES, enumName: 'VideoAssetStatus' })
  status!: VideoAssetStatusValue;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  durationSec!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  failureReason!: string | null;
}

/** The video of a post as the app plays it. URLs are signed and only
 * present once the video is ready. */
export class PostVideoDto {
  @ApiProperty({ enum: VIDEO_ASSET_STATUSES, enumName: 'VideoAssetStatus' })
  status!: VideoAssetStatusValue;

  @ApiPropertyOptional({ type: String, nullable: true })
  playbackUrl!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnailUrl!: string | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  durationSec!: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  height!: number | null;
}

export class VideoIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}
