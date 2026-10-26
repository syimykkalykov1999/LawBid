import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/** Owner 2026-10-21 (Telegram «Переслать»): at most this many messages and
 * chats in one forward, and this many message × chat pairs. */
export const FORWARD_MAX_SOURCES = 50;
export const FORWARD_MAX_TARGETS = 20;
export const FORWARD_MAX_PAIRS = 200;

export const FORWARD_SOURCE_KINDS = [
  'message',
  'group_message',
  'channel_post',
  'group_link',
  'channel_link',
] as const;
export type ForwardSourceKind = (typeof FORWARD_SOURCE_KINDS)[number];

export const FORWARD_TARGET_KINDS = [
  'conversation',
  'group',
  'channel',
] as const;
export type ForwardTargetKind = (typeof FORWARD_TARGET_KINDS)[number];

export class ForwardSourceDto {
  @ApiProperty({
    enum: FORWARD_SOURCE_KINDS,
    enumName: 'ForwardSourceKind',
    description:
      'message: a direct / case chat message; group_message; channel_post; group_link / channel_link: a protected group / channel shared as its link (id = the group / channel).',
  })
  @IsIn(FORWARD_SOURCE_KINDS)
  kind!: ForwardSourceKind;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class ForwardTargetDto {
  @ApiProperty({ enum: FORWARD_TARGET_KINDS, enumName: 'ForwardTargetKind' })
  @IsIn(FORWARD_TARGET_KINDS)
  kind!: ForwardTargetKind;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Forum groups: the topic to write in (default «General»).',
  })
  @IsOptional()
  @IsUUID('all')
  topicId?: string;
}

export class ForwardMessagesDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'App-generated, one per forward: a retry with the same id sends nothing twice.',
  })
  @IsUUID('all')
  requestId!: string;

  @ApiProperty({
    type: [ForwardSourceDto],
    description: `What to forward, oldest first (1–${FORWARD_MAX_SOURCES}); the order is kept.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FORWARD_MAX_SOURCES)
  @ValidateNested({ each: true })
  @Type(() => ForwardSourceDto)
  sources!: ForwardSourceDto[];

  @ApiProperty({
    type: [ForwardTargetDto],
    description: `Where to (1–${FORWARD_MAX_TARGETS}); at most ${FORWARD_MAX_PAIRS} message × chat pairs.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FORWARD_MAX_TARGETS)
  @ValidateNested({ each: true })
  @Type(() => ForwardTargetDto)
  targets!: ForwardTargetDto[];
}

export class ForwardResultDto {
  @ApiProperty({ type: ForwardTargetDto })
  target!: ForwardTargetDto;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty({ enum: ['sent', 'failed'], enumName: 'ForwardStatus' })
  status!: 'sent' | 'failed';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'failed: the error code of the target (UNSUPPORTED_IN_TARGET, GROUP_FORBIDDEN, CONVERSATION_CLOSED, MESSAGE_REQUEST_DECLINED, FORBIDDEN…).',
  })
  code!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'sent: the new message (or channel post).',
  })
  messageId!: string | null;
}

export class ForwardResponseDto {
  @ApiProperty({ type: [ForwardResultDto] })
  results!: ForwardResultDto[];
}
