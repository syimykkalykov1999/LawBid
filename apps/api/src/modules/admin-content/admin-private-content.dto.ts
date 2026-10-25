import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ConversationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class MessageIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class CaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class CaseFileParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  fileId!: string;
}

export class PrivateMessagesQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** One chat message WITHOUT its text: the body is revealed per message. */
export class PrivateMessageItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  senderId!: string | null;
  @ApiProperty() type!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() deleted!: boolean;
  @ApiProperty({ type: String, nullable: true }) fileName!: string | null;
  @ApiProperty({ type: Number, nullable: true }) durationMs!: number | null;
  @ApiProperty({ description: 'Always true: the text is hidden until revealed.' })
  bodyHidden!: boolean;
}

export class PrivateMessagesPageDto {
  @ApiProperty({ format: 'uuid' }) conversationId!: string;
  @ApiProperty({ format: 'uuid' }) attorneyId!: string;
  @ApiProperty({ format: 'uuid' }) clientId!: string;
  @ApiProperty({ type: PrivateMessageItemDto, isArray: true })
  items!: PrivateMessageItemDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class RevealedMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) conversationId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  senderId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ description: 'The original text as sent.' }) body!: string;
}

export class PrivateCallItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) callerId!: string;
  @ApiProperty({ format: 'uuid' }) calleeId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() video!: boolean;
  @ApiProperty() isGroup!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  answeredAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endedAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) durationSec!: number | null;
  @ApiProperty({ type: String, nullable: true }) endReason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PrivateCallsDto {
  @ApiProperty({ type: PrivateCallItemDto, isArray: true })
  items!: PrivateCallItemDto[];
}

export class PrivateCaseFileDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() mime!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PrivateCaseFilesDto {
  @ApiProperty({ type: PrivateCaseFileDto, isArray: true })
  items!: PrivateCaseFileDto[];
}

export class PrivateFileUrlDto {
  @ApiProperty() url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
