import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const HISTORY_PAGE_DEFAULT = 20;
export const HISTORY_PAGE_MAX = 50;

export class ListCaseHistoryQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: HISTORY_PAGE_MAX,
    default: HISTORY_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HISTORY_PAGE_MAX)
  limit?: number;
}

export class HistoryCaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  caseId!: string;
}

export class HistoryExportIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  exportId!: string;
}

export class HistoryPracticeAreaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  i18nKey!: string;

  @ApiProperty()
  nameEn!: string;
}

export class HistoryAcceptedBidDto {
  @ApiProperty({ description: 'Final amount in cents.' })
  amountCents!: number;

  @ApiProperty()
  feeType!: string;
}

/** One row of "История кейсов" (docs/04 §12). */
export class CaseHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: HistoryPracticeAreaDto })
  practiceArea!: HistoryPracticeAreaDto;

  @ApiProperty()
  primaryStateCode!: string;

  @ApiProperty({ description: 'Final status of the case.' })
  status!: string;

  @ApiProperty({ description: 'The case was deleted from the feed.' })
  deleted!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  closedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  archivedAt!: string | null;

  @ApiPropertyOptional({
    type: HistoryAcceptedBidDto,
    nullable: true,
    description:
      'The accepted bid; for an attorney only when it is their own bid.',
  })
  acceptedBid!: HistoryAcceptedBidDto | null;
}

/** A timeline row from case_journal, reduced to display-safe fields. */
export class CaseHistoryEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  eventType!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ enum: ['client', 'attorney', 'admin', 'system'] })
  actorRole!: 'client' | 'attorney' | 'admin' | 'system';

  @ApiPropertyOptional({ type: Number, nullable: true })
  amountCents!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  feeType!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  roundNo!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  reason!: string | null;
}

export class CaseHistoryDetailDto extends CaseHistoryItemDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Client full name. For an attorney only if contacts were disclosed to them on this case; null → the app shows "Client".',
  })
  clientName!: string | null;

  @ApiProperty({ type: CaseHistoryEventDto, isArray: true })
  events!: CaseHistoryEventDto[];
}

export const HISTORY_EXPORT_STATUSES = ['queued', 'ready', 'failed'] as const;
export type HistoryExportStatus = (typeof HISTORY_EXPORT_STATUSES)[number];

export class CaseHistoryExportDto {
  @ApiProperty({ format: 'uuid' })
  exportId!: string;

  @ApiProperty({ enum: HISTORY_EXPORT_STATUSES })
  status!: HistoryExportStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Signed download link, valid 10 minutes (status ready).',
  })
  url!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  expiresAt!: string | null;
}

export interface CaseHistoryPage {
  items: CaseHistoryItemDto[];
  nextCursor: string | null;
}
