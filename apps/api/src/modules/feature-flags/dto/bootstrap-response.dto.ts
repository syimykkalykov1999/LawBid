import { ApiProperty } from '@nestjs/swagger';
import { LegalDocType } from '@prisma/client';
import { I18nLanguageDto } from '../../i18n/dto/i18n-responses.dto';

/**
 * GET /config/bootstrap payload (BootstrapResponse, docs/01_FOUNDATION_AUTH.md
 * §15 stage 1.8) for the OpenAPI contract (docs/01 §6.3). snake_case like
 * the underlying Prisma columns — see BootstrapResponse's doc comment.
 */
export class BootstrapLegalDocumentDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Send as `documentId` with POST /users/me/consents.',
  })
  id!: string;

  @ApiProperty({ enum: LegalDocType, enumName: 'LegalDocType' })
  doc_type!: LegalDocType;

  @ApiProperty()
  version!: string;

  @ApiProperty()
  locale!: string;

  @ApiProperty({ type: String, nullable: true })
  content_url!: string | null;

  @ApiProperty({ type: String, nullable: true })
  content_md!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  published_at!: string | null;
}

export class BootstrapDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description: 'Feature flags by key (docs/01 §10.6).',
  })
  flags!: Record<string, boolean>;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Public app_config values (min versions, store URLs, ...).',
  })
  app_config!: Record<string, unknown>;

  @ApiProperty({ type: [I18nLanguageDto] })
  languages!: I18nLanguageDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description: 'Current bundle version per language code.',
  })
  translations_version!: Record<string, number>;

  @ApiProperty({ type: [BootstrapLegalDocumentDto] })
  legal_documents!: BootstrapLegalDocumentDto[];
}
