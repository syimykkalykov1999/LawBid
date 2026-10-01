import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
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

export const CONVERSATION_FOLDERS = [
  'all',
  'primary',
  'general',
  'waiting',
  'requests',
] as const;
export type ConversationFolderName = (typeof CONVERSATION_FOLDERS)[number];

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

  @ApiPropertyOptional({
    enum: CONVERSATION_FOLDERS,
    enumName: 'ConversationFolder',
    default: 'all',
    description:
      'Owner 2026-10-01: all · primary (case chats by default) · general · waiting (marked "waiting for my answer") · requests (OQ-043, message requests sent to me).',
  })
  @IsOptional()
  @IsIn(CONVERSATION_FOLDERS)
  folder?: ConversationFolderName;
}

/** Owner 2026-10-01: my own organisation of a chat. */
export class OrganizeConversationDto {
  @ApiPropertyOptional({
    enum: ['primary', 'general', 'auto'],
    description: 'auto = case chats Primary, direct chats General.',
  })
  @IsOptional()
  @IsIn(['primary', 'general', 'auto'])
  folder?: 'primary' | 'general' | 'auto';

  @ApiPropertyOptional({ description: '"Waiting for my answer" on / off.' })
  @IsOptional()
  @IsBoolean()
  waiting?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 280,
    description: 'A note pinned on the chat; "" or null clears it.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(280)
  note?: string | null;

  @ApiPropertyOptional({ description: 'Pinned to the top of my list.' })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class ChatFolderCountsDto {
  @ApiProperty() waiting!: number;
  @ApiProperty() requests!: number;
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

  /** OQ-047: only photos and documents (the chat's "Files" screen). */
  @ApiPropertyOptional({ enum: ['attachment'], enumName: 'MessagesFilter' })
  @IsOptional()
  @IsIn(['attachment'])
  only?: 'attachment';
}

export class SendMessageDto {
  @ApiProperty({ description: 'App-generated id (UUID), idempotency key.' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  clientMessageId!: string;

  @ApiPropertyOptional({
    enum: ['text', 'voice', 'attachment'],
    enumName: 'SendMessageType',
    default: 'text',
  })
  @IsOptional()
  @IsIn(['text', 'voice', 'attachment'])
  type?: 'text' | 'voice' | 'attachment';

  /** OQ-047: the attachment's original file name (shown on its card). */
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

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
    description:
      'Voice: a clean `chat_voice` file; attachment: a clean `chat_attachment` file of the sender.',
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

/** OQ-047: a photo or a document in a chat. */
export class ChatAttachmentDto {
  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Null while the antivirus scan runs.',
  })
  mime!: string | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  sizeBytes!: number | null;

  @ApiProperty()
  isImage!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Short signed link; null until scanned / in list previews.',
  })
  url!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  previewUrl!: string | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  height!: number | null;
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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'OQ-048: sent by the attorney\'s assistant — their name (shown as "Assistant of …").',
  })
  sentByAssistant!: string | null;

  @ApiProperty({ enum: ['text', 'system', 'voice', 'call', 'attachment'] })
  type!: 'text' | 'system' | 'voice' | 'call' | 'attachment';

  @ApiPropertyOptional({ type: () => VoiceNoteDto, nullable: true })
  voice!: VoiceNoteDto | null;

  @ApiPropertyOptional({ type: () => ChatAttachmentDto, nullable: true })
  attachment!: ChatAttachmentDto | null;

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

  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description:
      'Owner 2026-10-01: online now; null = not shown (hidden activity status, anonymous client, pending request).',
  })
  online!: boolean | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  lastSeenAt!: string | null;
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

  // Owner 2026-10-01: my organisation of this chat.
  @ApiProperty({ enum: ['primary', 'general'], enumName: 'ChatFolder' })
  folder!: 'primary' | 'general';

  @ApiProperty({ description: 'true = the folder is chosen automatically.' })
  folderAuto!: boolean;

  @ApiPropertyOptional({ type: Date, nullable: true })
  waitingSince!: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  pinnedAt!: Date | null;

  @ApiProperty({
    enum: ['case', 'direct'],
    enumName: 'ConversationKind',
    description: 'OQ-043: a case chat or a direct chat from a profile.',
  })
  kind!: 'case' | 'direct';

  @ApiProperty({
    enum: ['none', 'pending', 'accepted', 'declined'],
    enumName: 'MessageRequestStatus',
  })
  requestStatus!: 'none' | 'pending' | 'accepted' | 'declined';

  @ApiProperty({ description: 'The viewer sent this message request.' })
  requestedByMe!: boolean;
}

/** POST /conversations/direct (OQ-043). */
export class StartDirectChatDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

export class RequestsCountDto {
  @ApiProperty({ type: 'integer' })
  count!: number;
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
