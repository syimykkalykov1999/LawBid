import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Owner 2026-10-26: a button pressed on a chat notification. */
export class PushActionDto {
  @ApiProperty({
    description: 'The signed ticket the chat push carried (data.actionToken).',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(600)
  token!: string;

  @ApiProperty({
    description: 'FCM registration token of this device (still signed in).',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  fcmToken!: string;

  @ApiProperty({ enum: ['read', 'reply'] })
  @IsIn(['read', 'reply'])
  action!: 'read' | 'reply';

  @ApiPropertyOptional({
    format: 'uuid',
    description: '«Прочитано»: read up to this message.',
  })
  @IsOptional()
  @IsUUID('all')
  messageId?: string;

  @ApiPropertyOptional({
    maxLength: 4000,
    description: '«Ответить»: the text.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @ApiPropertyOptional({
    description: 'App-generated id of the reply (a retry never sends twice).',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientMessageId?: string;
}
