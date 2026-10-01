import { MentionDto } from '../../mentions/mention.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
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
export const POST_TITLE_MAX = 120;
export const POST_KINDS = ['post', 'news'] as const;
export type PostKindValue = (typeof POST_KINDS)[number];
export const POST_MEDIA_MAX = 9;
export const POSTS_PAGE_DEFAULT = 20;
export const POSTS_PAGE_MAX = 50;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** POST /posts (docs/05 §3.1). */
export class CreatePostDto {
  /** Owner 2026-09-30: the card's title. */
  @ApiProperty({ minLength: 1, maxLength: POST_TITLE_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(POST_TITLE_MAX)
  title!: string;

  /** Owner 2026-09-30: the qualification — a practice category or
   * subcategory code (`civil_litigation`, `civil_litigation.appeals`…). */
  @ApiProperty({
    example: 'civil_litigation.arbitration_and_mediation_representation',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  practiceCode!: string;

  /** Owner 2026-09-30: News — attorneys only. */
  @ApiPropertyOptional({
    enum: POST_KINDS,
    default: 'post',
    enumName: 'PostKind',
  })
  @IsOptional()
  @IsIn(POST_KINDS)
  kind?: PostKindValue;

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

/** PATCH /posts/:id — the title, the text and the qualification. */
export class UpdatePostDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: POST_TITLE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(POST_TITLE_MAX)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  practiceCode?: string;

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

  /** Owner 2026-09-30: only News / only regular posts (profile tabs). */
  @ApiPropertyOptional({ enum: POST_KINDS, enumName: 'PostKind' })
  @IsOptional()
  @IsIn(POST_KINDS)
  kind?: PostKindValue;
}

export class PostAuthorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  /** OQ-038: clients publish posts too. */
  @ApiProperty({ enum: ['attorney', 'client'] })
  role!: 'attorney' | 'client';

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

/** The qualification of a post (owner 2026-09-30). */
export class PostPracticeDto {
  @ApiProperty({
    example: 'civil_litigation.arbitration_and_mediation_representation',
  })
  code!: string;

  @ApiProperty({ example: 'civil_litigation' })
  categoryCode!: string;

  @ApiProperty({ example: 'Arbitration and Mediation Representation' })
  nameEn!: string;

  @ApiProperty()
  i18nKey!: string;
}

/** A post as the app shows it (docs/05 §2.4). */
export class PostDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  /** Owner 2026-09-30; null on older posts (the app splits the body). */
  @ApiPropertyOptional({ type: String, nullable: true })
  title!: string | null;

  @ApiProperty({ enum: POST_KINDS, enumName: 'PostKind' })
  kind!: PostKindValue;

  @ApiPropertyOptional({ type: PostPracticeDto, nullable: true })
  practice!: PostPracticeDto | null;

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

  @ApiProperty({
    type: () => MentionDto,
    isArray: true,
    description: 'OQ-042: people @mentioned in the text.',
  })
  mentions!: MentionDto[];

  @ApiProperty({ enum: ContentStatus, enumName: 'ContentStatus' })
  status!: ContentStatus;

  @ApiProperty({ type: 'integer' })
  likeCount!: number;

  @ApiProperty({ type: 'integer' })
  commentCount!: number;

  @ApiProperty({ type: 'integer' })
  saveCount!: number;

  /** OQ-037. */
  @ApiProperty({ type: 'integer' })
  shareCount!: number;

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
