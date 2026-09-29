import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const COMMENT_BODY_MAX = 1000;
export const COMMENTS_PAGE = 20;

/** POST /posts/:id/comments (docs/05 §5.1). */
export class CreateCommentDto {
  @ApiProperty({ minLength: 1, maxLength: COMMENT_BODY_MAX })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(COMMENT_BODY_MAX)
  body!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Reply target; a reply to a reply attaches to its top-level parent.',
  })
  @IsOptional()
  @IsUUID('all')
  parentCommentId?: string;
}

export class CommentIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class CommentsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** §5.2: attorneys are shown by their public profile; clients only as
 * "Имя + первая буква фамилии", with no id — their profiles are closed. */
export class CommentAuthorDto {
  @ApiProperty({ enum: ['attorney', 'client'] })
  kind!: 'attorney' | 'client';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Attorneys only.',
  })
  attorneyId!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Attorneys only.',
  })
  username!: string | null;

  @ApiProperty({ description: 'Attorney: full name; client: "Anna K."' })
  displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  verifiedBadge!: boolean;
}

export class CommentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  postId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  parentCommentId!: string | null;

  @ApiProperty({ type: CommentAuthorDto })
  author!: CommentAuthorDto;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: 'integer' })
  likeCount!: number;

  @ApiProperty({ type: 'integer' })
  replyCount!: number;

  @ApiProperty()
  likedByMe!: boolean;

  @ApiProperty({ description: 'Own comment, or a comment under own post.' })
  canDelete!: boolean;

  @ApiProperty()
  isMine!: boolean;

  @ApiProperty()
  createdAt!: string;
}

export class CommentDeletedDto {
  @ApiProperty({ default: true })
  deleted!: true;
}

export interface CommentPage {
  items: CommentDto[];
  nextCursor: string | null;
}
