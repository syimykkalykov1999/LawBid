import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommentAuthorDto } from '../comments/comments.dto';

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
}

export interface CaseCommentPage {
  items: CaseCommentDto[];
  nextCursor: string | null;
}
