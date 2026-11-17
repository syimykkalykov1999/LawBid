import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export const DATA_EXPORT_STATUSES = [
  'queued',
  'processing',
  'ready',
  'failed',
  'expired',
] as const;
export type DataExportStatusValue = (typeof DATA_EXPORT_STATUSES)[number];

/** docs/06 §5.2 "Скачать мои данные". */
export class DataExportJobDto {
  @ApiProperty({ format: 'uuid' })
  exportId!: string;

  @ApiProperty({ enum: DATA_EXPORT_STATUSES })
  status!: DataExportStatusValue;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Signed download link while the export is ready (24 hours from completion); also sent by email. Null on a ready export read without a fresh X-Reauth-Token once security.export_reauth_min_app_version covers the app: re-authenticate and read again.',
  })
  url!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  expiresAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    description:
      'While the export is being built: rows written and bytes so far.',
    properties: { rows: { type: 'integer' }, bytes: { type: 'integer' } },
  })
  progress?: { rows: number; bytes: number } | null;
}

export class DataExportIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  exportId!: string;
}
