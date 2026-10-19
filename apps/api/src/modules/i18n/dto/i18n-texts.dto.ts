import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** GET /admin/i18n/texts?prefix= (owner 2026-10-18: the admin edits the
 * «Справочник» texts in every language). */
export class I18nTextsQueryDto {
  @ApiProperty({ example: 'guide.' })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: 'prefix has an invalid format' })
  prefix!: string;
}

/** PUT /admin/i18n/texts — one text in one language. */
export class UpdateI18nTextDto {
  @ApiProperty({ example: 'guide.s1.title' })
  @IsString()
  @Length(1, 200)
  key!: string;

  @ApiProperty({ example: 'ru' })
  @IsString()
  @Length(2, 10)
  lang!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(1, 20000)
  value!: string;
}

export class I18nTextLanguageDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class I18nTextRowDto {
  @ApiProperty() key!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'lang → text',
  })
  values!: Record<string, string>;

  @ApiProperty({
    type: [String],
    description: 'Languages whose text was changed in the admin.',
  })
  edited!: string[];
}

export class I18nTextsDto {
  @ApiProperty({ type: [I18nTextLanguageDto] })
  languages!: I18nTextLanguageDto[];

  @ApiProperty({ type: [I18nTextRowDto] })
  keys!: I18nTextRowDto[];
}

/** POST /admin/i18n/texts/translate — a preview, nothing is saved. */
export class TranslateI18nTextDto {
  @ApiProperty({ description: 'The source text as edited.' })
  @IsString()
  @Length(1, 20000)
  text!: string;

  @ApiProperty({ example: 'ru' })
  @IsString()
  @Length(2, 10)
  source!: string;
}

export class TranslatedI18nTextDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'lang → machine translation',
  })
  values!: Record<string, string>;

  @ApiProperty({ type: [String], description: 'Languages that failed.' })
  failed!: string[];
}

/** PUT /admin/i18n/texts/many — one text in several languages. */
export class UpdateI18nTextManyDto {
  @ApiProperty({ example: 'guide.s1.title' })
  @IsString()
  @Length(1, 200)
  key!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  @IsObject()
  values!: Record<string, string>;
}

/** POST /admin/i18n/texts/reset — back to the built-in text. */
export class ResetI18nTextDto {
  @ApiProperty({ example: 'guide.s1.title' })
  @IsString()
  @Length(1, 200)
  key!: string;

  @ApiProperty({ required: false, description: 'Omit for every language.' })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  lang?: string;
}
