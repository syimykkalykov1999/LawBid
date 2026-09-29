import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** docs/05 §8.2: text only, up to 2000 characters. */
export const MESSAGE_MAX_CHARS = 2000;

export class ConversationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class ConversationsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({
    description:
      'Only conversations changed since (ISO time) — catch-up after a reconnect (§8.5).',
  })
  @IsOptional()
  @IsISO8601()
  updatedSince?: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Messages after this one, oldest first — catch-up after a reconnect (§8.5).',
  })
  @IsOptional()
  @IsUUID('all')
  afterId?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: 'App-generated id (UUID), idempotency key.' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  clientMessageId!: string;

  @ApiProperty({ maxLength: MESSAGE_MAX_CHARS })
  @IsString()
  // Hard stop for oversized payloads; the 2000-character rule itself is
  // MESSAGE_TOO_LONG from the service.
  @MaxLength(20000)
  body!: string;
}

export class ReadConversationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  lastReadMessageId!: string;
}

export class MuteConversationDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO time; null unmutes.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  until!: string | null;
}

export class MessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  senderId!: string | null;

  @ApiProperty({ enum: ['text', 'system'] })
  type!: 'text' | 'system';

  @ApiProperty({
    description:
      'body_display; for type=system a key (offer_accepted, no_agreement, case_closed, accepted_by_other) the app localizes.',
  })
  body!: string;

  @ApiProperty({ description: 'Contacts were hidden in this message (§8.3).' })
  contactMasked!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Only on the viewer's own messages (outbox matching).",
  })
  clientMessageId!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class ConversationCounterpartDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'null while an attorney sees the client as "Клиент по кейсу".',
  })
  id!: string | null;

  @ApiProperty({ enum: ['attorney', 'client'] })
  kind!: 'attorney' | 'client';

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  verifiedBadge!: boolean;
}

export class ConversationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty()
  caseTitle!: string;

  @ApiProperty({ enum: ['pre_acceptance', 'active', 'closed'] })
  status!: 'pre_acceptance' | 'active' | 'closed';

  @ApiProperty()
  contactsUnlocked!: boolean;

  @ApiProperty({ type: ConversationCounterpartDto })
  counterpart!: ConversationCounterpartDto;

  @ApiPropertyOptional({ type: MessageDto, nullable: true })
  lastMessage!: MessageDto | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastMessageAt!: Date | null;

  @ApiProperty()
  unreadCount!: number;

  @ApiPropertyOptional({ type: Date, nullable: true })
  mutedUntil!: Date | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'For "Seen" on own messages (§8.2).',
  })
  counterpartLastReadMessageId!: string | null;

  @ApiProperty()
  updatedAt!: Date;
}

export class ReadResultDto {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  lastReadMessageId!: string | null;
}

export interface ConversationPage {
  items: ConversationDto[];
  nextCursor: string | null;
}

export interface MessagePage {
  items: MessageDto[];
  nextCursor: string | null;
}
