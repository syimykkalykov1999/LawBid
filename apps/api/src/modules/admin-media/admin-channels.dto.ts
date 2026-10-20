import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const ADMIN_CHANNEL_STATUSES = ['active', 'hidden', 'banned'] as const;
export type AdminChannelStatus = (typeof ADMIN_CHANNEL_STATUSES)[number];

export class AdminChannelsQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_CHANNEL_STATUSES,
    enumName: 'AdminChannelStatus',
  })
  @IsOptional()
  @IsIn(ADMIN_CHANNEL_STATUSES)
  status?: AdminChannelStatus;

  @ApiPropertyOptional({ maxLength: 64, description: 'Title or @username.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  q?: string;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AdminChannelRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiProperty()
  ownerName!: string;

  @ApiProperty({ enum: ADMIN_CHANNEL_STATUSES, enumName: 'AdminChannelStatus' })
  status!: AdminChannelStatus;

  @ApiProperty({ type: 'integer' })
  subscriberCount!: number;

  @ApiProperty({ type: 'integer' })
  postCount!: number;

  /** Open reports on the channel and on its posts. */
  @ApiProperty({ type: 'integer' })
  openReports!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  moderationNote!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastPostAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AdminChannelPostDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ enum: ['active', 'hidden', 'removed'] })
  status!: string;

  @ApiProperty({ type: 'integer' })
  viewCount!: number;

  @ApiProperty({ type: 'integer' })
  commentCount!: number;

  @ApiProperty({ type: 'integer' })
  mediaCount!: number;

  @ApiProperty()
  hasVideo!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AdminChannelDto extends AdminChannelRowDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  /** The latest posts, newest first (up to 30). */
  @ApiProperty({ type: [AdminChannelPostDto] })
  posts!: AdminChannelPostDto[];
}

export class AdminChannelIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminChannelPostParamDto extends AdminChannelIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  postId!: string;
}

export class AdminChannelStatusDto {
  @ApiProperty({ enum: ADMIN_CHANNEL_STATUSES, enumName: 'AdminChannelStatus' })
  @IsIn(ADMIN_CHANNEL_STATUSES)
  status!: AdminChannelStatus;

  /** Told to the owner when the channel is hidden or closed. */
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export class AdminChannelPostActionDto {
  @ApiProperty({ enum: ['remove', 'restore'] })
  @IsIn(['remove', 'restore'])
  action!: 'remove' | 'restore';

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}
