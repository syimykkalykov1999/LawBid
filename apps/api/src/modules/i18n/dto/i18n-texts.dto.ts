import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

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
