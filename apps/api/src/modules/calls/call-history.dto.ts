import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CallPeerDto } from './calls.dto';

/** Owner 2026-10-21: «Calls» next to «Contacts» (WhatsApp's calls tab). */
export class CallHistoryQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** One finished call as the viewer saw it. */
export class CallHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: ['ended', 'missed', 'declined', 'busy', 'canceled', 'failed'],
    enumName: 'CallHistoryStatus',
  })
  status!: 'ended' | 'missed' | 'declined' | 'busy' | 'canceled' | 'failed';

  @ApiProperty({ description: 'The viewer placed the call.' })
  outgoing!: boolean;

  @ApiProperty()
  video!: boolean;

  @ApiProperty({ type: CallPeerDto })
  peer!: CallPeerDto;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  conversationId!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The group chat the call was started from (else null).',
  })
  groupId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  groupTitle!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  groupAvatarUrl!: string | null;

  @ApiProperty({ default: false })
  group!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  durationSec!: number | null;
}

/** A group call running now in one of my groups: «Join». */
export class OngoingGroupCallDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiProperty()
  groupTitle!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  groupAvatarUrl!: string | null;

  @ApiProperty()
  video!: boolean;

  @ApiProperty({ type: 'integer', description: 'People in the call now.' })
  joined!: number;

  @ApiProperty({ description: 'I am in it now (the button says «Return»).' })
  mine!: boolean;

  @ApiProperty()
  startedAt!: Date;
}

export interface CallHistoryPage {
  items: CallHistoryItemDto[];
  nextCursor: string | null;
}
