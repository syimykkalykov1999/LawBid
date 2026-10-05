import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID, Matches } from 'class-validator';

/** Owner 2026-10-05: what can be translated outside chats, and the zone
 * (Ключи и сервисы → Google Translate) each one belongs to. */
export const TRANSLATABLE_KINDS = [
  'post',
  'comment',
  'case',
  'bid',
  'review',
  'profile',
] as const;
export type TranslatableKind = (typeof TRANSLATABLE_KINDS)[number];

export class TranslateContentDto {
  @ApiProperty({
    enum: TRANSLATABLE_KINDS,
    enumName: 'TranslatableKind',
    description:
      'post / comment: the post or comment text; case: the description; bid: the bid message; review: the review text; profile: the attorney bio (id = the attorney user id).',
  })
  @IsIn(TRANSLATABLE_KINDS)
  kind!: TranslatableKind;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({
    description: 'Target language, ISO 639-1 (or zh-CN / zh-TW), e.g. "ru".',
    example: 'ru',
  })
  @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/)
  target!: string;
}

export class ContentTranslationDto {
  @ApiProperty({ description: 'The translated text.' })
  text!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Detected language of the original.',
  })
  sourceLanguage!: string | null;

  @ApiProperty()
  targetLanguage!: string;
}
