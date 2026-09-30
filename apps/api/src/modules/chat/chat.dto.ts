import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** docs/05 §8.2: text only, up to 2000 characters. */
export const MESSAGE_MAX_CHARS = 2000;

/** OQ-040 voice messages: 0.5 s … 15 min, up to 100 waveform bars 0–100. */
export const VOICE_MIN_MS = 500;
export const VOICE_MAX_MS = 15 * 60 * 1000;
export const VOICE_WAVEFORM_MAX = 100;

export class ConversationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class MessageIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  messageId!: string;
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

  @ApiPropertyOptional({
    enum: ['text', 'voice'],
    enumName: 'SendMessageType',
    default: 'text',
  })
  @IsOptional()
  @IsIn(['text', 'voice'])
  type?: 'text' | 'voice';

  @ApiPropertyOptional({
    maxLength: MESSAGE_MAX_CHARS,
    description: 'Text of a text message; ignored for voice.',
  })
  @IsOptional()
  @IsString()
  // Hard stop for oversized payloads; the 2000-character rule itself is
  // MESSAGE_TOO_LONG from the service.
  @MaxLength(20000)
  body?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Voice: a clean `chat_voice` file of the sender.',
  })
  @IsOptional()
  @IsUUID('all')
  fileId?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: VOICE_MIN_MS,
    maximum: VOICE_MAX_MS,
  })
  @IsOptional()
  @IsInt()
  @Min(VOICE_MIN_MS)
  @Max(VOICE_MAX_MS)
  durationMs?: number;

  @ApiPropertyOptional({
    type: 'integer',
    isArray: true,
    description: `Up to ${VOICE_WAVEFORM_MAX} bars, each 0–100.`,
  })
  @IsOptional()
  @ArrayMaxSize(VOICE_WAVEFORM_MAX)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(100, { each: true })
  waveform?: number[];
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
  // Absent or null = unmute (generated clients drop null fields).
  @IsOptional()
  @IsISO8601()
  until?: string | null;
}

/** OQ-040: the audio of a voice message. */
export class VoiceNoteDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Short signed link; null in chat-list previews.',
  })
  url!: string | null;

  @ApiProperty({ type: 'integer' })
  durationMs!: number;

  @ApiProperty({ type: 'integer', isArray: true })
  waveform!: number[];

  @ApiProperty({ description: 'The recipient has played it.' })
  listened!: boolean;
}

/** OQ-041: a call in the chat log; senderId is the caller. */
export class CallLogDto {
  @ApiProperty({
    enum: ['ended', 'missed', 'declined', 'busy', 'canceled', 'failed'],
    enumName: 'CallOutcome',
  })
  outcome!: 'ended' | 'missed' | 'declined' | 'busy' | 'canceled' | 'failed';

  @ApiProperty({ type: 'integer', description: 'Talk time; 0 if unanswered.' })
  durationSec!: number;
}

export class MessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  senderId!: string | null;

  @ApiProperty({ enum: ['text', 'system', 'voice', 'call'] })
  type!: 'text' | 'system' | 'voice' | 'call';

  @ApiPropertyOptional({ type: () => VoiceNoteDto, nullable: true })
  voice!: VoiceNoteDto | null;

  @ApiPropertyOptional({ type: () => CallLogDto, nullable: true })
  call!: CallLogDto | null;

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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Reserved: null when a conversation has no case.',
  })
  caseId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  caseTitle!: string | null;

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
