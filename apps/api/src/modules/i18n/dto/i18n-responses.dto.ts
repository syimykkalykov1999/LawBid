import { ApiProperty } from '@nestjs/swagger';

/**
 * Response payloads of /i18n/* and /admin/i18n/* (docs/01_FOUNDATION_AUTH.md
 * §9.3) for the OpenAPI contract (docs/01 §6.3). Field names are the
 * i18n_languages column names (snake_case): I18nLanguagesService returns
 * the Prisma rows as-is and ResponseInterceptor does not re-case keys.
 */

/** One active interface language (i18n_languages row). */
export class I18nLanguageDto {
  @ApiProperty({ description: 'ISO 639-1 code.', example: 'en' })
  code!: string;

  @ApiProperty({ example: 'English' })
  name_native!: string;

  @ApiProperty()
  is_active!: boolean;

  @ApiProperty()
  is_rtl!: boolean;

  @ApiProperty({ type: 'integer' })
  sort!: number;
}

/** GET /i18n/bundle/{lang}: full bundle, or the delta since `since`. */
export class I18nBundleDto {
  @ApiProperty({ example: 'en' })
  lang!: string;

  @ApiProperty({
    type: 'integer',
    description: 'Current bundle version; send it back as `since`.',
  })
  version!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'key -> text. Full bundle without `since`; only keys changed after `since` with it (empty when up to date).',
  })
  translations!: Record<string, string>;
}

export class I18nChangedEntryDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  lang!: string;
}

export class I18nImportErrorDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    description: '1-based row in the uploaded file.',
  })
  row?: number;

  @ApiProperty({ required: false })
  key?: string;

  @ApiProperty({ required: false })
  lang?: string;

  @ApiProperty()
  message!: string;
}

/** POST /admin/i18n/import (I18nImportReport). */
export class I18nImportReportDto {
  @ApiProperty({ enum: ['dry-run', 'apply'], enumName: 'I18nImportMode' })
  mode!: 'dry-run' | 'apply';

  @ApiProperty({ description: 'False when `errors` is non-empty.' })
  valid!: boolean;

  @ApiProperty({ description: 'True only for a valid `apply` run.' })
  applied!: boolean;

  @ApiProperty({ type: [String] })
  newLanguages!: string[];

  @ApiProperty({ type: [String] })
  newKeys!: string[];

  @ApiProperty({ type: [I18nChangedEntryDto] })
  changedKeys!: I18nChangedEntryDto[];

  @ApiProperty({ type: 'integer' })
  unchangedCount!: number;

  @ApiProperty({ type: [I18nImportErrorDto] })
  errors!: I18nImportErrorDto[];
}
