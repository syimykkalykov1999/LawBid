import { ApiProperty } from '@nestjs/swagger';
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
      'Signed download link while the export is ready (24 hours from completion); also sent by email.',
  })
  url!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  expiresAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class DataExportIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  exportId!: string;
}
