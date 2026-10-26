import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_LOCALES,
  type EmailTemplateKey,
  type EmailTemplateLocale,
} from '../auth/providers/email/email-template-render';

export const TEMPLATE_SUBJECT_MAX = 200;
export const TEMPLATE_TEXT_MAX = 20_000;
export const TEMPLATE_HTML_MAX = 100_000;

export class EmailTemplateKeyParamDto {
  @ApiProperty({ enum: EMAIL_TEMPLATE_KEYS })
  @IsIn(EMAIL_TEMPLATE_KEYS)
  key!: EmailTemplateKey;
}

export class EmailTemplateParamDto extends EmailTemplateKeyParamDto {
  @ApiProperty({ enum: EMAIL_TEMPLATE_LOCALES })
  @IsIn(EMAIL_TEMPLATE_LOCALES)
  locale!: EmailTemplateLocale;
}

export class EmailTemplateContentDto {
  @ApiProperty({
    maxLength: TEMPLATE_SUBJECT_MAX,
    description: 'Subject; `{{var}}` placeholders.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_SUBJECT_MAX)
  subject!: string;

  @ApiProperty({
    maxLength: TEMPLATE_TEXT_MAX,
    description: 'Plain-text body; `{{var}}` placeholders.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_TEXT_MAX)
  textBody!: string;

  @ApiPropertyOptional({
    maxLength: TEMPLATE_HTML_MAX,
    nullable: true,
    description:
      'Optional. Starts with `<` → raw HTML (values HTML-escaped). Otherwise text wrapped in the branded LawBid layout. Empty → the text body in the layout.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_HTML_MAX)
  htmlBody?: string | null;
}

export class SaveEmailTemplateDto extends EmailTemplateContentDto {
  @ApiProperty({ description: 'false keeps the text but sends the built-in.' })
  @IsBoolean()
  enabled!: boolean;
}

/** Test send: the given content, else the saved override / built-in. */
export class TestEmailTemplateDto {
  @ApiPropertyOptional({ maxLength: TEMPLATE_SUBJECT_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_SUBJECT_MAX)
  subject?: string;

  @ApiPropertyOptional({ maxLength: TEMPLATE_TEXT_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_TEXT_MAX)
  textBody?: string;

  @ApiPropertyOptional({ maxLength: TEMPLATE_HTML_MAX, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_HTML_MAX)
  htmlBody?: string | null;
}

export class EmailTemplateVariableDto {
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() sample!: string;
  @ApiProperty({ description: 'Must appear in an override.' })
  required!: boolean;
}

export class EmailTemplateLocaleStatusDto {
  @ApiProperty({ enum: EMAIL_TEMPLATE_LOCALES }) locale!: EmailTemplateLocale;
  @ApiProperty() overridden!: boolean;
  @ApiProperty({ description: 'Override exists and is enabled.' })
  active!: boolean;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

export class EmailTemplateSummaryDto {
  @ApiProperty({ enum: EMAIL_TEMPLATE_KEYS }) key!: EmailTemplateKey;
  @ApiProperty({ description: 'Russian title for the admin.' }) title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: EmailTemplateVariableDto, isArray: true })
  variables!: EmailTemplateVariableDto[];
  @ApiProperty({ type: EmailTemplateLocaleStatusDto, isArray: true })
  locales!: EmailTemplateLocaleStatusDto[];
}

export class RenderedEmailDto {
  @ApiProperty() subject!: string;
  @ApiProperty() text!: string;
  @ApiPropertyOptional({ nullable: true }) html!: string | null;
}

export class EmailTemplatePreviewDto extends RenderedEmailDto {
  @ApiProperty({
    type: [String],
    description: 'Placeholders not in the catalog (rendered empty).',
  })
  unknownVariables!: string[];
}

export class EmailTemplateOverrideDto {
  @ApiProperty() subject!: string;
  @ApiProperty() textBody!: string;
  @ApiPropertyOptional({ nullable: true }) htmlBody!: string | null;
  @ApiProperty() enabled!: boolean;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  updatedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class EmailTemplateDetailDto {
  @ApiProperty({ enum: EMAIL_TEMPLATE_KEYS }) key!: EmailTemplateKey;
  @ApiProperty({ enum: EMAIL_TEMPLATE_LOCALES }) locale!: EmailTemplateLocale;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: EmailTemplateVariableDto, isArray: true })
  variables!: EmailTemplateVariableDto[];
  @ApiProperty({
    type: RenderedEmailDto,
    description:
      'The built-in email with sample values (built-ins are English for every locale).',
  })
  defaultRendered!: RenderedEmailDto;
  @ApiPropertyOptional({ type: EmailTemplateOverrideDto, nullable: true })
  override!: EmailTemplateOverrideDto | null;
}

export class EmailTemplateTestResultDto {
  @ApiProperty({ description: 'Masked address the test went to.' })
  sentTo!: string;
}
