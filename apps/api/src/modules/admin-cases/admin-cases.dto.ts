import {
  CASE_DEADLINE_KINDS,
  CASE_URGENCIES,
  CASE_URGENCY_LEVELS,
} from '../cases/domain/case-urgency';
import { DOSSIER_ITEMS } from '../cases/domain/case-dossier';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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

// --- Audit 2026-10-02: the case list, card and actions ------------------------

const CASE_STATUSES = [
  'open',
  'in_progress',
  'pending_completion',
  'disputed',
  'closed',
  'archived',
] as const;

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class AdminCasesQueryDto extends CursorDto {
  @ApiPropertyOptional({ enum: CASE_STATUSES, enumName: 'AdminCaseStatus' })
  @IsOptional()
  @IsIn(CASE_STATUSES)
  status?: (typeof CASE_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Text in the title.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  clientId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({ example: 'IL', description: 'Any state of the case.' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{2}$/)
  stateCode?: string;

  @ApiPropertyOptional({
    description: 'Only cases with / without open reports.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  hasReports?: boolean;

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-05: only cases with a date (court hearing, filing…) from today on.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  withDeadline?: boolean;
}

export class AdminCaseActionDto {
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  reason = '';
}

export const CASES_BULK_ACTIONS = [
  'hide',
  'close',
  'archive',
  'restore',
] as const;

/** Owner 2026-10-04: one case action for up to 500 cases, one reason. */
export class AdminCasesBulkDto extends AdminCaseActionDto {
  @ApiProperty({ enum: CASES_BULK_ACTIONS, enumName: 'AdminCasesBulkAction' })
  @IsIn(CASES_BULK_ACTIONS)
  action!: (typeof CASES_BULK_ACTIONS)[number];

  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class AdminCaseRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: CASE_STATUSES }) status!: string;
  @ApiProperty({ format: 'uuid' }) clientId!: string;
  @ApiProperty() clientName!: string;
  @ApiProperty({ format: 'uuid' }) practiceAreaId!: string;
  @ApiProperty() practiceAreaName!: string;
  @ApiProperty() stateCode!: string;
  @ApiProperty({ type: 'integer' }) bidsCount!: number;
  @ApiProperty({ type: 'integer' }) commentCount!: number;
  @ApiProperty({ type: 'integer' }) viewCount!: number;
  @ApiProperty({ type: 'integer' }) openReports!: number;
  @ApiProperty({ description: 'A paid / granted promotion is running.' })
  promoted!: boolean;
  /** Owner 2026-10-05: the case dossier ("4 of 6"). */
  @ApiProperty({ type: 'integer' }) imagesCount!: number;
  @ApiProperty({ type: 'integer' }) documentsCount!: number;
  @ApiProperty({ type: 'integer', description: 'Filled-in items, 0–6.' })
  dossierScore!: number;
  @ApiProperty({
    type: [String],
    enum: DOSSIER_ITEMS,
    description: 'Dossier items the client has not filled in.',
  })
  dossierMissing!: string[];
  // Owner 2026-10-05: the client's urgency (a level or `by_date`), the
  // level it reads as today and the date with what it is.
  @ApiProperty({
    enum: CASE_URGENCIES,
    enumName: 'CaseUrgency',
    nullable: true,
  })
  urgency!: string | null;
  @ApiProperty({
    enum: CASE_URGENCY_LEVELS,
    enumName: 'CaseUrgencyLevel',
    nullable: true,
  })
  urgencyLevel!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true })
  deadlineAt!: string | null;
  @ApiProperty({
    enum: CASE_DEADLINE_KINDS,
    enumName: 'CaseDeadlineKind',
    nullable: true,
  })
  deadlineKind!: string | null;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminCaseStateDto {
  @ApiProperty() code!: string;
  @ApiProperty() isPrimary!: boolean;
}

export class AdminCaseBidDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) attorneyId!: string;
  @ApiProperty() attorneyName!: string;
  @ApiProperty() status!: string;
  @ApiProperty() feeType!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ type: 'integer' }) rounds!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

/** Owner 2026-10-05: a client → attorney case invite. */
export class AdminCaseInviteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) attorneyId!: string;
  @ApiProperty() attorneyName!: string;
  @ApiProperty({
    description: 'pending / accepted / declined / cancelled / expired / closed',
  })
  status!: string;
  @ApiProperty({ type: 'integer', nullable: true })
  budgetCents!: number | null;
  @ApiProperty({ type: String, nullable: true }) declineReason!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  bidId!: string | null;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminCaseCardDto extends AdminCaseRowDto {
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ enum: ['amount', 'clarify_later'] }) budgetMode!: string;
  @ApiProperty({ type: 'integer', nullable: true }) budgetCents!: number | null;
  @ApiProperty({ type: AdminPartyDto }) client!: AdminPartyDto;
  @ApiProperty({ type: [AdminCaseStateDto] }) states!: AdminCaseStateDto[];
  @ApiProperty({ type: 'integer' }) photosCount!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  acceptedBidId!: string | null;
  @ApiProperty({ type: [AdminCaseBidDto], description: 'Newest first (≤100).' })
  bids!: AdminCaseBidDto[];
  @ApiProperty({
    type: [AdminCaseInviteDto],
    description: 'Owner 2026-10-05: invites the client sent, newest first.',
  })
  invites!: AdminCaseInviteDto[];
  @ApiProperty({
    type: [AdminJournalEntryDto],
    description: 'case_journal, newest first (last 50).',
  })
  journal!: AdminJournalEntryDto[];
  @ApiProperty({ type: [String], description: 'case_disputes ids.' })
  disputeIds!: string[];
  @ApiProperty({ type: [String], description: 'contact_issue_reports ids.' })
  contactIssueIds!: string[];
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  promotedUntil!: string | null;
}
