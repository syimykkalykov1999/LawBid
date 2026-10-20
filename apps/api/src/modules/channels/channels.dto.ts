import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { UserBriefDto } from '../user-brief/user-brief.dto';
import { PostVideoDto } from '../videos/videos.dto';

export const CHANNEL_STATUSES = ['active', 'hidden', 'banned'] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export const CHANNEL_ROLES = ['owner', 'admin'] as const;
export type ChannelRole = (typeof CHANNEL_ROLES)[number];

/** The reactions a subscriber can put on a post. */
export const CHANNEL_REACTIONS = ['👍', '❤️', '🔥', '👏', '😮', '🙏'] as const;

export const CHANNEL_TITLE_MAX = 64;
export const CHANNEL_DESCRIPTION_MAX = 255;
export const CHANNEL_POST_MAX = 4000;
export const CHANNEL_COMMENT_MAX = 1000;
// Owner 2026-10-20 (Telegram): 5–32, a–z 0–9 _, a letter first, no «__»,
// no «_» last.
export const CHANNEL_USERNAME_RE = /^(?=.{5,32}$)[a-z](?:[a-z0-9]|_(?!_|$))*$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lowerUsername = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.trim().replace(/^@/, '').toLowerCase()
    : value;

export class ChannelDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'Lowercase, without @.' })
  username!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  commentsEnabled!: boolean;

  /** Hidden / banned are only reported to the channel's admins. */
  @ApiProperty({ enum: CHANNEL_STATUSES, enumName: 'ChannelStatus' })
  status!: ChannelStatus;

  @ApiProperty({ type: 'integer' })
  subscriberCount!: number;

  @ApiProperty({ type: 'integer' })
  postCount!: number;

  @ApiProperty({ type: UserBriefDto })
  owner!: UserBriefDto;

  @ApiProperty()
  isSubscribed!: boolean;

  @ApiProperty()
  isMuted!: boolean;

  /** My role in the channel, null for a plain reader. */
  @ApiPropertyOptional({
    enum: CHANNEL_ROLES,
    enumName: 'ChannelRole',
    nullable: true,
  })
  myRole!: ChannelRole | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastPostAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ChannelListQueryDto {
  @ApiPropertyOptional({
    enum: ['discover', 'subscribed', 'managed'],
    default: 'discover',
  })
  @IsOptional()
  @IsIn(['discover', 'subscribed', 'managed'])
  scope?: 'discover' | 'subscribed' | 'managed';

  @ApiPropertyOptional({ maxLength: 64, description: 'Title or @username.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  q?: string;

  @ApiPropertyOptional({
    description: 'Discover without q: opaque cursor of the ranked list.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  cursor?: string;
}

export class CreateChannelDto {
  @ApiProperty({ minLength: 1, maxLength: CHANNEL_TITLE_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CHANNEL_TITLE_MAX)
  title!: string;

  @ApiProperty({
    description:
      '5–32 letters, digits or _, starting with a letter, no «__», not ending with _.',
    pattern: '^@?[A-Za-z][A-Za-z0-9_]{4,31}$',
  })
  @Transform(lowerUsername)
  @IsString()
  @Matches(CHANNEL_USERNAME_RE)
  username!: string;

  @ApiPropertyOptional({ maxLength: CHANNEL_DESCRIPTION_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CHANNEL_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  avatarFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;
}

export class UpdateChannelDto {
  @ApiPropertyOptional({ maxLength: CHANNEL_TITLE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CHANNEL_TITLE_MAX)
  title?: string;

  /** Owner only. */
  @ApiPropertyOptional({ pattern: '^@?[A-Za-z][A-Za-z0-9_]{4,31}$' })
  @IsOptional()
  @Transform(lowerUsername)
  @IsString()
  @Matches(CHANNEL_USERNAME_RE)
  username?: string;

  @ApiPropertyOptional({ maxLength: CHANNEL_DESCRIPTION_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CHANNEL_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  avatarFileId?: string;

  /** true removes the avatar. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  removeAvatar?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;
}

export class ChannelMediaDto {
  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  previewUrl!: string;
}

export class ChannelReactionCountDto {
  @ApiProperty({ enum: CHANNEL_REACTIONS })
  emoji!: string;

  @ApiProperty({ type: 'integer' })
  count!: number;
}

export class ChannelPostDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  channelId!: string;

  @ApiProperty({ type: UserBriefDto })
  author!: UserBriefDto;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: [ChannelMediaDto] })
  media!: ChannelMediaDto[];

  @ApiPropertyOptional({ type: PostVideoDto, nullable: true })
  video!: PostVideoDto | null;

  @ApiProperty({ type: 'integer' })
  viewCount!: number;

  @ApiProperty({ type: 'integer' })
  commentCount!: number;

  @ApiProperty({ type: 'integer' })
  shareCount!: number;

  @ApiProperty({ type: [ChannelReactionCountDto] })
  reactions!: ChannelReactionCountDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  myReaction!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  editedAt!: string | null;
}

export class CreateChannelPostDto {
  @ApiPropertyOptional({ maxLength: CHANNEL_POST_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CHANNEL_POST_MAX)
  body?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  mediaFileIds?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  videoAssetId?: string;
}

export class UpdateChannelPostDto {
  @ApiProperty({ minLength: 1, maxLength: CHANNEL_POST_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CHANNEL_POST_MAX)
  body!: string;
}

export class ChannelPageQueryDto {
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

export class ChannelViewsDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  postIds!: string[];
}

export class ChannelReactionDto {
  @ApiProperty({ enum: CHANNEL_REACTIONS })
  @IsIn(CHANNEL_REACTIONS)
  emoji!: string;
}

export class ChannelSubscriptionDto {
  @ApiProperty()
  isSubscribed!: boolean;

  @ApiProperty()
  isMuted!: boolean;

  @ApiProperty({ type: 'integer' })
  subscriberCount!: number;
}

export class UpdateChannelSubscriptionDto {
  @ApiProperty()
  @IsBoolean()
  muted!: boolean;
}

export class ChannelCommentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UserBriefDto })
  author!: UserBriefDto;

  @ApiProperty()
  body!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  /** The viewer may delete it (own, or a channel admin). */
  @ApiProperty()
  canDelete!: boolean;
}

export class CreateChannelCommentDto {
  @ApiProperty({ minLength: 1, maxLength: CHANNEL_COMMENT_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CHANNEL_COMMENT_MAX)
  body!: string;
}

export class ChannelAdminDto {
  @ApiProperty({ type: UserBriefDto })
  user!: UserBriefDto;

  @ApiProperty({ enum: CHANNEL_ROLES, enumName: 'ChannelRole' })
  role!: ChannelRole;
}

export class AddChannelAdminDto {
  @ApiProperty({ description: '@username of the person to add.' })
  @Transform(lowerUsername)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  username!: string;
}

export class ChannelRefParamDto {
  @ApiProperty({ description: 'Channel id or @username.' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  ref!: string;
}

export class ChannelIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class ChannelPostParamDto extends ChannelIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId!: string;
}

export class ChannelCommentParamDto extends ChannelPostParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  commentId!: string;
}

export class ChannelAdminParamDto extends ChannelIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}
