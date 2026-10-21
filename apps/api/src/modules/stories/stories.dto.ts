import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PostVideoDto } from '../videos/videos.dto';
import { UserBriefDto } from '../user-brief/user-brief.dto';

export const STORY_KINDS = ['photo', 'video', 'text'] as const;
export type StoryKind = (typeof STORY_KINDS)[number];

export const STORY_AUDIENCES = ['all', 'followers', 'contacts'] as const;
export type StoryAudience = (typeof STORY_AUDIENCES)[number];

/** Backgrounds of a text story (the app draws the gradient for each key). */
export const STORY_BACKGROUNDS = [
  'gold',
  'navy',
  'wine',
  'forest',
  'plum',
  'slate',
  'sunset',
  'ocean',
] as const;

export const STORY_TEXT_MAX = 280;
export const STORY_OVERLAYS_MAX = 10;

/** An emoji sticker on a story; x, y are fractions of the frame. */
export class StoryOverlayDto {
  @ApiProperty({ maxLength: 16 })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;

  @ApiProperty({ minimum: 0.3, maximum: 4 })
  @IsNumber()
  @Min(0.3)
  @Max(4)
  scale!: number;

  /** Radians. */
  @ApiProperty({ minimum: -7, maximum: 7 })
  @IsNumber()
  @Min(-7)
  @Max(7)
  rotation!: number;
}

export class CreateStoryDto {
  @ApiProperty({ enum: STORY_KINDS, enumName: 'StoryKind' })
  @IsIn(STORY_KINDS)
  kind!: StoryKind;

  /** photo: the author's clean `post_image` file. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  fileId?: string;

  /** video: an upload from POST /stories/video-uploads that is ready. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  videoAssetId?: string;

  /** The caption of a photo / video, the whole text of a text story. */
  @ApiPropertyOptional({ maxLength: STORY_TEXT_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(STORY_TEXT_MAX)
  text?: string;

  @ApiPropertyOptional({ enum: STORY_BACKGROUNDS })
  @IsOptional()
  @IsIn(STORY_BACKGROUNDS)
  background?: string;

  @ApiPropertyOptional({ type: [StoryOverlayDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(STORY_OVERLAYS_MAX)
  @ValidateNested({ each: true })
  @Type(() => StoryOverlayDto)
  overlays?: StoryOverlayDto[];

  /** Default: the author's privacy setting. */
  @ApiPropertyOptional({ enum: STORY_AUDIENCES, enumName: 'StoryAudience' })
  @IsOptional()
  @IsIn(STORY_AUDIENCES)
  audience?: StoryAudience;
}

export class StoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UserBriefDto })
  author!: UserBriefDto;

  @ApiProperty({ enum: STORY_KINDS, enumName: 'StoryKind' })
  kind!: StoryKind;

  /** photo: 1080 px link. */
  @ApiPropertyOptional({ type: String, nullable: true })
  mediaUrl!: string | null;

  /** photo: 320 px link (archive grid). */
  @ApiPropertyOptional({ type: String, nullable: true })
  previewUrl!: string | null;

  @ApiPropertyOptional({ type: PostVideoDto, nullable: true })
  video!: PostVideoDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  text!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  background!: string | null;

  @ApiProperty({ type: [StoryOverlayDto] })
  overlays!: StoryOverlayDto[];

  @ApiProperty({ enum: STORY_AUDIENCES, enumName: 'StoryAudience' })
  audience!: StoryAudience;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  /** Seen by the viewer already. */
  @ApiProperty()
  viewedByMe!: boolean;

  @ApiProperty()
  isMine!: boolean;

  /** Views — only for the author, otherwise 0. */
  @ApiProperty({ type: 'integer' })
  viewCount!: number;

  /** The viewer may answer in a chat with the author. */
  @ApiProperty()
  canReply!: boolean;
}

/** One bubble in the row above the feed. */
export class StoryTrayItemDto {
  @ApiProperty({ type: UserBriefDto })
  user!: UserBriefDto;

  @ApiProperty()
  isMe!: boolean;

  @ApiProperty({ type: 'integer' })
  storyCount!: number;

  @ApiProperty({ type: 'integer' })
  unseenCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  latestAt!: string | null;
}

export class StoryViewerDto {
  @ApiProperty({ type: UserBriefDto })
  user!: UserBriefDto;

  @ApiProperty({ format: 'date-time' })
  viewedAt!: string;
}

export class StoryPageQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class StorySettingsDto {
  @ApiProperty({ enum: STORY_AUDIENCES, enumName: 'StoryAudience' })
  audience!: StoryAudience;

  @ApiProperty()
  allowReplies!: boolean;

  /** People my stories are hidden from. */
  @ApiProperty({ type: 'integer' })
  hiddenCount!: number;
}

export class UpdateStorySettingsDto {
  @ApiPropertyOptional({ enum: STORY_AUDIENCES, enumName: 'StoryAudience' })
  @IsOptional()
  @IsIn(STORY_AUDIENCES)
  audience?: StoryAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowReplies?: boolean;
}

export class CreateStoryVideoUploadDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  sizeBytes!: number;

  @ApiProperty({ type: 'integer', minimum: 1, description: 'Seconds.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationSec!: number;

  /** The part to play (≤ stories.max_video_sec); default: from the start. */
  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600_000)
  trimStartMs?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600_000)
  trimEndMs?: number;
}

export class StoryIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class StoryUserIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}
