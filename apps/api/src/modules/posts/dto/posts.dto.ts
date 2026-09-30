import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const POST_BODY_MAX = 2200;
export const POST_MEDIA_MAX = 10;
export const POSTS_PAGE_DEFAULT = 20;
export const POSTS_PAGE_MAX = 50;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** POST /posts (docs/05 §3.1). */
export class CreatePostDto {
  @ApiProperty({ minLength: 1, maxLength: POST_BODY_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(POST_BODY_MAX)
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: POST_MEDIA_MAX,
    description: 'Clean post_image file ids, in display order.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POST_MEDIA_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mediaFileIds?: string[];
}

/** PATCH /posts/:id — only the text is editable (§3.3). */
export class UpdatePostDto {
  @ApiProperty({ minLength: 1, maxLength: POST_BODY_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(POST_BODY_MAX)
  body!: string;
}

export class PostIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class PostsPageQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: POSTS_PAGE_MAX,
    default: POSTS_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POSTS_PAGE_MAX)
  limit?: number;
}

export class PostAuthorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '256 px avatar link.',
  })
  avatarUrl!: string | null;

  @ApiProperty({ description: 'Blue check (docs/03 §6.3).' })
  verifiedBadge!: boolean;

  /** Owner 2026-09-30: the viewer follows this author (card Follow). */
  @ApiProperty()
  isFollowing!: boolean;
}

export class PostMediaDto {
  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty({ type: 'integer' })
  position!: number;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  height!: number | null;

  @ApiProperty({ description: 'Full size (≤ 2048 px), signed link.' })
  url!: string;

  @ApiProperty({ description: '320 px preview.' })
  previewUrl!: string;

  @ApiProperty({ description: '1080 px medium.' })
  mediumUrl!: string;
}

/** A post as the app shows it (docs/05 §2.4). */
export class PostDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: PostAuthorDto })
  author!: PostAuthorDto;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: [PostMediaDto] })
  media!: PostMediaDto[];

  @ApiProperty({
    type: [String],
    description: 'Hashtags without #, lowercase.',
  })
  tags!: string[];

  @ApiProperty({ enum: ContentStatus, enumName: 'ContentStatus' })
  status!: ContentStatus;

  @ApiProperty({ type: 'integer' })
  likeCount!: number;

  @ApiProperty({ type: 'integer' })
  commentCount!: number;

  @ApiProperty({ type: 'integer' })
  saveCount!: number;

  @ApiProperty()
  likedByMe!: boolean;

  @ApiProperty()
  savedByMe!: boolean;

  @ApiProperty()
  isMine!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '"Изменено" (§3.3).',
  })
  editedAt!: string | null;
}

export class PostDeletedDto {
  @ApiProperty({ default: true })
  deleted!: true;
}

export interface PostPage {
  items: PostDto[];
  nextCursor: string | null;
}

/** A "Сохранённое" post row (docs/05 §4): unavailable → "Пост недоступен". */
export class SavedPostItemDto {
  @ApiProperty({ format: 'uuid' })
  postId!: string;

  @ApiProperty()
  savedAt!: string;

  @ApiProperty()
  available!: boolean;

  @ApiPropertyOptional({ type: PostDto, nullable: true })
  post!: PostDto | null;
}

export class SavedPostsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}
