import { MentionDto } from '../../mentions/mention.dto';
import { PostVideoDto } from '../../videos/videos.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';
import {
  POST_CONTENT_CLASSES,
  type PostContentClass,
} from '../content-filter.service';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  ValidateNested,
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
import { tidy } from '../../../common/utils/tidy-text';
import { MaxTextChars } from '../../../common/app-settings/max-text-chars.decorator';

/** Owner 2026-10-12: a thread (text only, no files) is up to 5000 characters. */
export const POST_BODY_MAX = 5000;

export const POST_TITLE_MAX = 120;
export const POST_KINDS = ['post', 'news'] as const;
export type PostKindValue = (typeof POST_KINDS)[number];

/** Owner 2026-10-18 (profile tabs): 'video' — video posts / reels (Рилсы);
 * 'visual' — photo or file posts without a video (Посты grid); 'text' —
 * text-only posts (briefs). */
export const POST_MEDIA_FILTERS = ['video', 'visual', 'text'] as const;
export type PostMediaFilter = (typeof POST_MEDIA_FILTERS)[number];
/** Hard ceilings; the live counts are the admin's «Загрузки и файлы»
 * (bug 17, default 9 photos and 9 documents per post / reel). */
export const POST_MEDIA_MAX = 20;
export const POST_ATTACHMENTS_MAX = 20;
export const POST_ATTACHMENT_NAME_MAX = 120;
export const POSTS_PAGE_DEFAULT = 20;
export const POSTS_PAGE_MAX = 50;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Owner 2026-10-02: "Added location" under the author's name. */
export class PostLocationDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;
}

/** Owner 2026-10-05: one document of a post, as the author attaches it. */
export class PostAttachmentInputDto {
  @ApiProperty({ format: 'uuid', description: 'A clean post_attachment file.' })
  @IsUUID('all')
  fileId!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: POST_ATTACHMENT_NAME_MAX,
    description: 'The name readers see and download (e.g. "Lease.pdf").',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(POST_ATTACHMENT_NAME_MAX)
  fileName!: string;
}

/** POST /posts (docs/05 §3.1). */
export class CreatePostDto {
  /** Owner 2026-09-30: the card's title. Owner 2026-10-18: optional
   * ('' is fine) — a post needs a title, a text, photos, a video or files
   * (checked in PostsService.create). */
  @ApiProperty({ maxLength: POST_TITLE_MAX })
  @Transform(trim)
  @IsString()
  @MaxTextChars('limits.post_title_chars')
  title!: string;

  /** Owner 2026-09-30: the qualification — a practice category or
   * subcategory code (`civil_litigation`, `civil_litigation.appeals`…). */
  // Owner 2026-10-01: optional — news about politics or anything general
  // has no qualification.
  @ApiPropertyOptional({
    example: 'civil_litigation.arbitration_and_mediation_representation',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  practiceCode?: string;

  /** Owner 2026-09-30: News — attorneys only. */
  @ApiPropertyOptional({
    enum: POST_KINDS,
    default: 'post',
    enumName: 'PostKind',
  })
  @IsOptional()
  @IsIn(POST_KINDS)
  kind?: PostKindValue;

  /** Owner 2026-10-05: 'legal' or 'general'. A post with a law topic or
   * News is always legal; without one the author picks (default general). */
  @ApiPropertyOptional({
    enum: POST_CONTENT_CLASSES,
    enumName: 'PostContentClass',
  })
  @IsOptional()
  @IsIn(POST_CONTENT_CLASSES)
  contentClass?: PostContentClass;

  /** Owner 2026-10-07: the description is optional ('' is fine). */
  @ApiProperty({ maxLength: POST_BODY_MAX })
  @Transform(tidy)
  @IsString()
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

  /** Owner 2026-10-05: documents (count and formats: admin, bug 17). */
  @ApiPropertyOptional({
    type: [PostAttachmentInputDto],
    maxItems: POST_ATTACHMENTS_MAX,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POST_ATTACHMENTS_MAX)
  @ValidateNested({ each: true })
  @Type(() => PostAttachmentInputDto)
  attachments?: PostAttachmentInputDto[];

  /** Owner 2026-10-01: a reel — the uploaded video (POST /videos/uploads).
   * The post appears once the video is encoded. Owner 2026-10-05: a
   * reel's photos and documents form its inner page ("Смотреть"). */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  videoAssetId?: string;

  @ApiPropertyOptional({ type: PostLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PostLocationDto)
  location?: PostLocationDto;

  /** Default true; false = nobody can comment. */
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;

  /** Owner 2026-10-15: hide the like / view counter from other people. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hideLikes?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hideViews?: boolean;
}

/** PATCH /posts/:id — the title, the text and the qualification. */
export class UpdatePostDto {
  /** Owner 2026-10-18: '' clears the title (the post keeps its text,
   * photos, video or files). */
  @ApiPropertyOptional({ maxLength: POST_TITLE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxTextChars('limits.post_title_chars')
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  practiceCode?: string;

  /** Owner 2026-10-05: 'legal' or 'general'. A post with a law topic or
   * News is always legal; without one the author picks (default general). */
  @ApiPropertyOptional({
    enum: POST_CONTENT_CLASSES,
    enumName: 'PostContentClass',
  })
  @IsOptional()
  @IsIn(POST_CONTENT_CLASSES)
  contentClass?: PostContentClass;

  /** Owner 2026-10-07: the description is optional ('' is fine). */
  @ApiProperty({ maxLength: POST_BODY_MAX })
  @Transform(tidy)
  @IsString()
  @MaxLength(POST_BODY_MAX)
  body!: string;

  /** Owner 2026-10-07: comments can be turned off (or on) after posting. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;
}

/** PATCH /posts/:id/counters (owner 2026-10-15): the author's switches. */
export class PostCountersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideLikes?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideViews?: boolean;
}

/** Owner 2026-10-18: the author turns comments of an own post on / off. */
export class PostCommentsSettingDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class PostIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

/** Owner 2026-10-12: where to pin a post — slot 1..3; owner 2026-10-28:
 * 1..6 (two rows of three in the app). */
export const MAX_PIN_SLOT = 6;

export class PinPostDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: MAX_PIN_SLOT })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PIN_SLOT)
  slot!: number;
}

/** GET /reels: the page plus the Reels tab's topic filter. */
export class ReelsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: POSTS_PAGE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POSTS_PAGE_MAX)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'A practice category or subcategory code; the same hidden-tag filter as the feed topics.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  practice?: string;
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

  /** Owner 2026-10-18: the profile's Posts / Reels / briefs tabs. */
  @ApiPropertyOptional({
    enum: POST_MEDIA_FILTERS,
    enumName: 'PostMediaFilter',
  })
  @IsOptional()
  @IsIn(POST_MEDIA_FILTERS)
  media?: PostMediaFilter;
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

  /** Owner 2026-10-13: Identity level 0..3 (attorneys; 0 for clients). */
  @ApiProperty({ minimum: 0, maximum: 3 })
  trustLevel!: number;

  /** Owner 2026-10-13: the attorney's verification was rejected — a red
   * circle on the avatar. */
  @ApiProperty({ required: false })
  identityRejected?: boolean;

  /** Owner 2026-10-13: up to three practice keys under the name. */
  @ApiProperty({ type: [String] })
  practiceI18nKeys!: string[];

  /** Owner 2026-10-13: attorney: licensed states ("NY, CA"); client: state. */
  @ApiPropertyOptional({ type: String, nullable: true })
  location!: string | null;

  /** Owner 2026-10-22 (audit #4 §5, NY Rule 7.1(f)): the attorney is
   * licensed in a state that requires the «Attorney Advertising» label —
   * the app shows it on the post. Always false for clients. */
  @ApiProperty({
    description:
      'Show the «Attorney Advertising» label on this post (the author is licensed in a state that requires it).',
  })
  advertisingLabel!: boolean;
}

/** Owner 2026-10-12 (Threads): who put this post into the list. */
export class PostReposterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  /** Display name ("First Last"), empty when none is set. */
  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['attorney', 'client'] })
  role!: 'attorney' | 'client';

  /** Owner 2026-10-18: when this person reposted it (profile «Брифы и
   * репосты» orders briefs and reposts by time); null in other lists. */
  @ApiPropertyOptional({ type: String, nullable: true })
  repostedAt?: string | null;
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

/** Owner 2026-10-05: a document of a post with a signed download link. */
export class PostAttachmentDto {
  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty({ type: 'integer' })
  position!: number;

  @ApiProperty()
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mime!: string;

  @ApiProperty({ type: 'integer' })
  sizeBytes!: number;

  @ApiProperty({ description: 'Signed download link (1 hour).' })
  url!: string;
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

  @ApiPropertyOptional({ type: PostLocationDto, nullable: true })
  location!: PostLocationDto | null;

  @ApiProperty({ default: true })
  commentsEnabled!: boolean;

  /** Owner 2026-10-18: set while the author keeps the post in «Архив»
   * (nobody else gets an archived post). */
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  archivedAt!: string | null;

  /** Owner 2026-10-15: the author hid this counter (counts are 0 for others). */
  @ApiProperty({ default: false })
  likesHidden!: boolean;

  @ApiProperty({ default: false })
  viewsHidden!: boolean;

  /** Owner 2026-09-30; null on older posts (the app splits the body). */
  @ApiPropertyOptional({ type: String, nullable: true })
  title!: string | null;

  @ApiProperty({ enum: POST_KINDS, enumName: 'PostKind' })
  kind!: PostKindValue;

  @ApiPropertyOptional({ type: PostPracticeDto, nullable: true })
  practice!: PostPracticeDto | null;

  /** Owner 2026-10-05: legal or general (personal) post. */
  @ApiProperty({ enum: POST_CONTENT_CLASSES, enumName: 'PostContentClass' })
  contentClass!: PostContentClass;

  /** Owner 2026-10-28: the per-state results disclaimer the server adds
   * to an attorney's post that quotes results or testimonials. */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Show this line under the post (e.g. "Prior results do not guarantee a similar outcome."): the author is licensed in a state that requires it and the text quotes results or testimonials.',
  })
  advertisingDisclaimer?: string | null;

  @ApiProperty({ type: PostAuthorDto })
  author!: PostAuthorDto;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: [PostMediaDto] })
  media!: PostMediaDto[];

  /** Owner 2026-10-05: documents (reels: on the inner page). */
  @ApiProperty({ type: [PostAttachmentDto] })
  attachments!: PostAttachmentDto[];

  /** Owner 2026-10-01: a reel's video (null for photo/text posts). */
  @ApiPropertyOptional({ type: PostVideoDto, nullable: true })
  video!: PostVideoDto | null;

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

  /** Owner 2026-10-12: views of a video post / reel. */
  @ApiProperty({ type: 'integer' })
  viewCount!: number;

  /** Owner 2026-10-07: Threads-style reposts. */
  @ApiProperty({ type: 'integer' })
  repostCount!: number;

  @ApiProperty()
  likedByMe!: boolean;

  @ApiProperty()
  repostedByMe!: boolean;

  /** Set when the post reaches this list as someone's repost (a followed
   * account in the feed, or the profile's own list). */
  @ApiPropertyOptional({ type: PostReposterDto, nullable: true })
  repostedBy?: PostReposterDto | null;

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

  /** Owner 2026-10-12: 1..6 (was 1..3 until 2026-10-28) when pinned to the
   * top of the author's list. */
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  pinSlot?: number | null;

  /** Owner 2026-10-05: set on a paid promoted post in the feed — the app
   * shows «Реклама» and reports the open to POST /promotions/:id/click. */
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  promotionId?: string | null;

  /** Owner 2026-10-15: the button of a promoted post (null = none). */
  @ApiPropertyOptional({ type: () => PostPromotionCtaDto, nullable: true })
  promotionCta?: PostPromotionCtaDto | null;
}

export class PostPromotionCtaDto {
  @ApiProperty({ enum: ['more', 'message', 'profile', 'download', 'call'] })
  type!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  value!: string | null;
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

/** Owner 2026-10-18: /posts/:id/reposts and /users/:id/reposts. */
export class RepostsQueryDto extends SavedPostsQueryDto {}

/** Owner 2026-10-13: can the caller attach files to a new post / reel. */
export class PostAttachmentsAllowedDto {
  @ApiProperty()
  allowed!: boolean;

  @ApiProperty({ enum: ['by_subscription', 'off_for_all', 'on_for_all'] })
  mode!: 'by_subscription' | 'off_for_all' | 'on_for_all';
}
