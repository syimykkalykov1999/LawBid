import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  LEGAL_DOC_TYPE_LIST,
  LEGAL_LOCALES,
  LEGAL_STATUSES,
} from './legal-documents.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const MAX_LEGAL_MD = 200_000;

// ---- public --------------------------------------------------------------

export class LegalDocTypeParamDto {
  @ApiProperty({ enum: LEGAL_DOC_TYPE_LIST })
  @IsIn(LEGAL_DOC_TYPE_LIST)
  type!: (typeof LEGAL_DOC_TYPE_LIST)[number];
}

export class LegalDocLocaleQueryDto {
  @ApiPropertyOptional({
    enum: LEGAL_LOCALES,
    description:
      'Falls back to English when there is no text in this language.',
  })
  @IsOptional()
  @IsIn(LEGAL_LOCALES)
  locale?: (typeof LEGAL_LOCALES)[number];
}

export class LegalDocumentBriefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: LEGAL_DOC_TYPE_LIST }) docType!: string;
  @ApiProperty({ enum: LEGAL_LOCALES }) locale!: string;
  @ApiProperty({ example: '2026-10-05.1' }) version!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
}

export class LegalDocumentPublicDto extends LegalDocumentBriefDto {
  @ApiProperty({ description: 'Markdown.' }) contentMd!: string;
  @ApiProperty({
    description:
      'Users who accepted an older version were asked to accept this one again.',
  })
  requiresReacceptance!: boolean;
}

export class PendingLegalDocumentDto extends LegalDocumentBriefDto {
  @ApiProperty({
    enum: ['new', 'updated'],
    description: '`new` — never accepted; `updated` — a material change.',
  })
  reason!: 'new' | 'updated';
}

export class AcceptLegalDocumentsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Ids of the current versions the user ticked.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsUUID('all', { each: true })
  documentIds!: string[];

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;
}

// ---- admin ---------------------------------------------------------------

export class AdminLegalLocaleStateDto {
  @ApiProperty({ enum: LEGAL_LOCALES }) locale!: string;
  @ApiProperty({ type: String, nullable: true }) currentVersion!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
  @ApiProperty() hasDraft!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  draftUpdatedAt!: string | null;
  @ApiProperty({ enum: ['none', 'draft', 'published', 'published_draft'] })
  state!: 'none' | 'draft' | 'published' | 'published_draft';
}

export class AdminLegalDocumentRowDto {
  @ApiProperty({ enum: LEGAL_DOC_TYPE_LIST }) docType!: string;
  @ApiProperty() titleEn!: string;
  @ApiProperty() titleRu!: string;
  @ApiProperty({ type: [AdminLegalLocaleStateDto] })
  locales!: AdminLegalLocaleStateDto[];
}

export class AdminLegalVersionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: LEGAL_DOC_TYPE_LIST }) docType!: string;
  @ApiProperty({ enum: LEGAL_LOCALES }) locale!: string;
  @ApiProperty({ description: '`draft` for the draft, else 2026-10-05.1' })
  version!: string;
  @ApiProperty({ enum: LEGAL_STATUSES }) status!: string;
  @ApiProperty() isCurrent!: boolean;
  @ApiProperty() requiresReacceptance!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) changeNote!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  changedBy!: string | null;
  @ApiProperty({ type: String, nullable: true })
  changedByName!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  rollbackOfId!: string | null;
  @ApiProperty({ description: 'Consents recorded against this version.' })
  consents!: number;
  @ApiProperty({ type: 'integer' }) length!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Markdown; only in the detail calls.',
  })
  contentMd!: string | null;
}

export class AdminLegalLocaleDetailDto {
  @ApiProperty({ enum: LEGAL_LOCALES }) locale!: string;
  @ApiProperty({ type: AdminLegalVersionDto, nullable: true })
  current!: AdminLegalVersionDto | null;
  @ApiProperty({ type: AdminLegalVersionDto, nullable: true })
  draft!: AdminLegalVersionDto | null;
}

export class AdminLegalDocumentDetailDto {
  @ApiProperty({ enum: LEGAL_DOC_TYPE_LIST }) docType!: string;
  @ApiProperty() titleEn!: string;
  @ApiProperty() titleRu!: string;
  @ApiProperty({ type: [AdminLegalLocaleDetailDto] })
  locales!: AdminLegalLocaleDetailDto[];
}

export class LegalDocLocaleParamDto extends LegalDocTypeParamDto {
  @ApiProperty({ enum: LEGAL_LOCALES })
  @IsIn(LEGAL_LOCALES)
  locale!: (typeof LEGAL_LOCALES)[number];
}

export class LegalVersionIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class SaveLegalDraftDto {
  @ApiProperty({ description: 'Markdown.', maxLength: MAX_LEGAL_MD })
  @IsString()
  @MinLength(20)
  @MaxLength(MAX_LEGAL_MD)
  contentMd!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  changeNote?: string;
}

export class PublishLegalDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'Ask users who accepted an older version to accept this one again (material change). Default on.',
  })
  @IsOptional()
  @IsBoolean()
  requiresReacceptance?: boolean;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  changeNote?: string;
}
