import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ConversationDto, MessageDto } from '../chat/chat.dto';

export const SAVED_CHAT_TABS = ['all', 'media', 'files', 'links'] as const;
export type SavedChatTab = (typeof SAVED_CHAT_TABS)[number];

export class SavedChatMessageParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  messageId!: string;
}

export class SavedChatQueryDto {
  @ApiPropertyOptional({
    enum: SAVED_CHAT_TABS,
    enumName: 'SavedChatTab',
    default: 'all',
    description:
      'media = photos, videos and voice notes; files = documents; links = messages with a link.',
  })
  @IsOptional()
  @IsIn(SAVED_CHAT_TABS)
  tab?: SavedChatTab;

  @ApiPropertyOptional({
    description:
      'Text in the message, the file name, the sender or the chat title.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** Owner 2026-10-20: one saved chat message with the chat it came from. */
export class SavedChatItemDto {
  @ApiProperty({ type: Date })
  savedAt!: Date;

  @ApiProperty({ type: () => MessageDto })
  message!: MessageDto;

  @ApiProperty({
    type: () => ConversationDto,
    description: 'The chat the message is in (for the title and the opener).',
  })
  chat!: ConversationDto;

  @ApiProperty({ description: 'The person wrote it.' })
  mine!: boolean;
}

export class SavedChatIdsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Ids of every saved message (newest 5000).',
  })
  ids!: string[];
}
