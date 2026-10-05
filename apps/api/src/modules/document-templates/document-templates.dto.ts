import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { FILE_MIME } from '../files/files.policy';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const bool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Owner 2026-10-05: templates are PDF or Word — formats a case and a
 * chat both accept, so "attach to a case / chat" always works. */
export const TEMPLATE_MIMES = [
  FILE_MIME.pdf,
  FILE_MIME.docx,
  FILE_MIME.doc,
] as const;
export type TemplateMime = (typeof TEMPLATE_MIMES)[number];

export const TEMPLATE_AUDIENCES = ['everyone', 'lawyers'] as const;
export type TemplateAudience = (typeof TEMPLATE_AUDIENCES)[number];

export const TEMPLATE_SORTS = ['popular', 'new'] as const;
export type TemplateSort = (typeof TEMPLATE_SORTS)[number];

/** Where a copy of a template goes; the copy is then sent in a chat or
 * added to a case with the existing endpoints. */
export const TEMPLATE_COPY_TARGETS = [
  'chat_attachment',
  'case_attachment',
] as const;
export type TemplateCopyTarget = (typeof TEMPLATE_COPY_TARGETS)[number];

export const TEMPLATE_BULK_ACTIONS = [
  'publish',
  'unpublish',
  'delete',
] as const;
export type TemplateBulkAction = (typeof TEMPLATE_BULK_ACTIONS)[number];

const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export class TemplateIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class TemplatesQueryDto {
  @ApiPropertyOptional({ description: 'Search in title and description.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({
    description: 'Two-letter state; templates for every state are included.',
  })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z0-9]{2}$/)
  state?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @Matches(LANGUAGE)
  language?: string;

  @ApiPropertyOptional({ enum: TEMPLATE_SORTS, enumName: 'TemplateSort' })
  @IsOptional()
  @IsIn(TEMPLATE_SORTS)
  sort?: TemplateSort;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class DocumentTemplateDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mime!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  practiceAreaId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'i18n key of the practice area name.',
  })
  practiceAreaKey!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'English name of the practice area (fallback).',
  })
  practiceAreaName!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Two-letter state; null = every state.',
  })
  state!: string | null;
  @ApiProperty() language!: string;
  @ApiProperty({ enum: TEMPLATE_AUDIENCES, enumName: 'TemplateAudience' })
  audience!: TemplateAudience;
  @ApiProperty() downloadCount!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({
    description:
      "True when the user's plan does not include document templates: the template can be browsed but not downloaded or attached.",
  })
  locked!: boolean;
}

export class TemplateDownloadDto {
  @ApiProperty({ description: 'Short-lived signed link (saves as fileName).' })
  url!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mime!: string;
  @ApiProperty() sizeBytes!: number;
}

export class CopyTemplateDto {
  @ApiProperty({
    enum: TEMPLATE_COPY_TARGETS,
    enumName: 'TemplateCopyTarget',
    description:
      'chat_attachment: send it with a chat message; case_attachment: add it to a case.',
  })
  @IsIn(TEMPLATE_COPY_TARGETS)
  target!: TemplateCopyTarget;
}

// --- admin ------------------------------------------------------------------------

export class AdminTemplatesQueryDto extends TemplatesQueryDto {
  @ApiPropertyOptional({ description: 'true = published, false = drafts.' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  published?: boolean;
}

export class AdminDocumentTemplateDto extends DocumentTemplateDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() published!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminTemplateUploadDto {
  @ApiProperty({ enum: TEMPLATE_MIMES })
  @IsIn(TEMPLATE_MIMES)
  mime!: TemplateMime;

  @ApiProperty({
    minimum: 1,
    description:
      'Bytes; the `files.document_template_max_size_mb` setting applies.',
  })
  @IsInt()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  sizeBytes!: number;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string;
}

export class AdminTemplateFileParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  fileId!: string;
}

class TemplateFieldsDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Name the file is saved under, e.g. "lease.pdf".',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName?: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('all')
  practiceAreaId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Two-letter state; null = every state.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(upper)
  @Matches(/^[A-Z0-9]{2}$/)
  state?: string | null;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @Matches(LANGUAGE)
  language?: string;

  @ApiPropertyOptional({
    enum: TEMPLATE_AUDIENCES,
    enumName: 'TemplateAudience',
  })
  @IsOptional()
  @IsIn(TEMPLATE_AUDIENCES)
  audience?: TemplateAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class CreateDocumentTemplateDto extends TemplateFieldsDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A clean uploaded template file.',
  })
  @IsUUID('all')
  fileId!: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;
}

export class UpdateDocumentTemplateDto extends TemplateFieldsDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Replace the document with another clean upload.',
  })
  @IsOptional()
  @IsUUID('all')
  fileId?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;
}

export class AdminTemplatesBulkDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiProperty({ enum: TEMPLATE_BULK_ACTIONS, enumName: 'TemplateBulkAction' })
  @IsIn(TEMPLATE_BULK_ACTIONS)
  action!: TemplateBulkAction;
}
