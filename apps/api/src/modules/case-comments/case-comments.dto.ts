import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';
import { MaxTextChars } from '../../common/app-settings/max-text-chars.decorator';
import { tidy } from '../../common/utils/tidy-text';
import { CommentAuthorDto } from '../comments/comments.dto';

/** PATCH /case-comments/:id — Owner 2026-10-25: edit within the admin's
 * time window. */
export class EditCaseCommentDto {
  @ApiProperty({ minLength: 1 })
  @Transform(tidy)
  @IsString()
  @MinLength(1)
  @MaxTextChars('limits.comment_chars')
  body!: string;
}

/**
 * Owner 2026-09-30 (OQ-034): a comment under a case — same shape as a
 * post comment (CommentDto) with caseId instead of postId. The client is
 * never named to attorneys (kind 'client', displayName "Client").
 */
export class CaseCommentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  parentCommentId!: string | null;

  @ApiProperty({ type: CommentAuthorDto })
  author!: CommentAuthorDto;

  @ApiProperty({ description: 'Written by the client who owns the case.' })
  byCaseOwner!: boolean;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: 'integer' })
  likeCount!: number;

  @ApiProperty({ type: 'integer' })
  replyCount!: number;

  @ApiProperty()
  likedByMe!: boolean;

  @ApiProperty({ description: 'Own comment, or any comment on own case.' })
  canDelete!: boolean;

  @ApiProperty()
  isMine!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Set when the author edited the text (earlier texts are kept on the server for legal audit).',
  })
  editedAt!: string | null;
}

export interface CaseCommentPage {
  items: CaseCommentDto[];
  nextCursor: string | null;
}
