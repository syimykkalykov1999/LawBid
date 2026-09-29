import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

class CursorDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class DisputesQueueQueryDto extends CursorDto {
  @ApiPropertyOptional({ enum: ['open', 'resolved'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'resolved'])
  status?: 'open' | 'resolved';
}

export class ContactIssuesQueueQueryDto extends CursorDto {
  @ApiPropertyOptional({
    enum: ['open', 'confirmed', 'rejected'],
    default: 'open',
  })
  @IsOptional()
  @IsIn(['open', 'confirmed', 'rejected'])
  status?: 'open' | 'confirmed' | 'rejected';
}

export class AdminIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminPartyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) role!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastName!: string | null;
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
}

export class AdminCaseSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: string;
  @ApiProperty() stateCode!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: AdminPartyDto, nullable: true })
  client!: AdminPartyDto | null;
  @ApiProperty({
    type: AdminPartyDto,
    nullable: true,
    description: 'Attorney of the accepted bid.',
  })
  attorney!: AdminPartyDto | null;
}

export class AdminDisputeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ format: 'uuid' }) openedBy!: string;
  @ApiProperty({ type: String, nullable: true, enum: ['client', 'attorney'] })
  openedByRole!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) resolvedBy!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) resolutionNote!: string | null;
  @ApiProperty({ type: AdminCaseSummaryDto }) case!: AdminCaseSummaryDto;
}

export class AdminJournalEntryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty({ type: String, nullable: true }) actorRole!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorUserId!:
    string | null;
  @ApiProperty({ type: Object }) payload!: unknown;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminDisputeCardDto extends AdminDisputeDto {
  @ApiProperty({
    type: [AdminJournalEntryDto],
    description: 'case_journal, oldest first (last 200).',
  })
  journal!: AdminJournalEntryDto[];
  @ApiProperty({
    type: 'integer',
    description: 'Other disputes opened by the same user.',
  })
  openerDisputes!: number;
}

export class AdminContactIssueDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() issueType!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) resolvedBy!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) resolutionNote!: string | null;
  @ApiProperty({ type: AdminCaseSummaryDto }) case!: AdminCaseSummaryDto;
  @ApiProperty({
    type: AdminPartyDto,
    nullable: true,
    description: 'Reporting attorney.',
  })
  attorney!: AdminPartyDto | null;
  @ApiProperty({
    type: 'integer',
    description: "The client's confirmed reports so far.",
  })
  clientConfirmedReports!: number;
  @ApiProperty({
    type: 'integer',
    description: 'contacts.suspend_after_confirmed_reports',
  })
  suspendThreshold!: number;
}

export class AdminContactIssueCardDto extends AdminContactIssueDto {
  @ApiProperty({
    type: [String],
    description: 'Contact fields disclosed for this bid.',
  })
  disclosedFields!: string[];
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  disclosedAt!: string | null;
  @ApiProperty({
    type: [AdminContactIssueDto],
    description: "The client's other reports.",
  })
  clientHistory!: AdminContactIssueDto[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
