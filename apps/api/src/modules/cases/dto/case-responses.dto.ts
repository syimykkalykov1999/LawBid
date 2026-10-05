import {
  CASE_DEADLINE_KINDS,
  CASE_URGENCIES,
  CASE_URGENCY_LEVELS,
  type CaseDeadlineKind,
  type CaseUrgency,
  type CaseUrgencyLevel,
} from '../domain/case-urgency';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetMode, CaseStatus } from '@prisma/client';

export class PracticeAreaRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty()
  i18nKey!: string;
}

export class CaseStateDto {
  @ApiProperty({ example: 'NY' })
  stateCode!: string;

  @ApiProperty()
  isPrimary!: boolean;
}

/** The client-owner's view of one of their own cases (docs/04 §11.1). */
/** OQ-031: a case photo — short-lived signed links. */
export class CasePhotoDto {
  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({
    description: '320 px preview (the file itself for documents).',
  })
  previewUrl!: string;

  @ApiProperty({
    description: 'image/* or a document (application/pdf, Word) — OQ-034.',
  })
  mime!: string;

  @ApiProperty({ type: 'integer' })
  sizeBytes!: number;
}

export class CaseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: PracticeAreaRefDto })
  practiceArea!: PracticeAreaRefDto;

  @ApiProperty({ example: 'NY' })
  primaryStateCode!: string;

  @ApiProperty({ type: [CaseStateDto] })
  states!: CaseStateDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  city!: string | null;

  @ApiProperty({ enum: BudgetMode, enumName: 'BudgetMode' })
  budgetMode!: BudgetMode;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  budgetCents!: number | null;

  /** Owner 2026-10-04: `art:0..3` / `icon:<name>`; null = from the id. */
  @ApiPropertyOptional({ type: String, nullable: true, example: 'art:2' })
  coverKey?: string | null;

  /** Owner 2026-10-04/05: the client's choice — a level, or `by_date`
   * (see deadlineAt); null when not set. */
  @ApiPropertyOptional({
    enum: CASE_URGENCIES,
    enumName: 'CaseUrgency',
    nullable: true,
  })
  urgency?: CaseUrgency | null;

  /** Owner 2026-10-05: the level the case reads as today (a dated case's
   * level follows from the days left; `overdue` once the date passed). */
  @ApiPropertyOptional({
    enum: CASE_URGENCY_LEVELS,
    enumName: 'CaseUrgencyLevel',
    nullable: true,
  })
  urgencyLevel?: CaseUrgencyLevel | null;

  /** Owner 2026-10-05: the date the client needs it by (YYYY-MM-DD). */
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-03',
  })
  deadlineAt?: string | null;

  /** Owner 2026-10-05: what the date is (court hearing, filing…). */
  @ApiPropertyOptional({
    enum: CASE_DEADLINE_KINDS,
    enumName: 'CaseDeadlineKind',
    nullable: true,
  })
  deadlineKind?: CaseDeadlineKind | null;

  @ApiProperty({ enum: CaseStatus, enumName: 'CaseStatus' })
  status!: CaseStatus;

  @ApiProperty({ type: 'integer' })
  viewCount!: number;

  @ApiProperty({ type: 'integer' })
  bidsCount!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  lastActivityAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  archivedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  clientCompletedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  attorneyConfirmedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  autoCloseAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  closedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  deletedAt!: string | null;

  /**
   * §10.2 "Is this case still relevant?" prompt time, else null. Set while
   * the prompt is pending; POST /cases/:id/keep-alive clears it.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  stalePromptSentAt!: string | null;
}

/** One card of GET /users/me/cases (docs/04 §11.1). */
export class CaseSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  /** Owner 2026-09-30: the first photo (the "Mine" grid), else null. */
  @ApiPropertyOptional({ type: String, nullable: true })
  coverUrl?: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: PracticeAreaRefDto })
  practiceArea!: PracticeAreaRefDto;

  @ApiProperty({ example: 'NY' })
  primaryStateCode!: string;

  @ApiProperty({ type: 'integer', description: 'States besides the primary.' })
  additionalStateCount!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  city!: string | null;

  @ApiProperty({ enum: CaseStatus, enumName: 'CaseStatus' })
  status!: CaseStatus;

  @ApiProperty({ enum: BudgetMode, enumName: 'BudgetMode' })
  budgetMode!: BudgetMode;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  budgetCents!: number | null;

  /** Owner 2026-10-04: `art:0..3` / `icon:<name>`; null = from the id. */
  @ApiPropertyOptional({ type: String, nullable: true, example: 'art:2' })
  coverKey?: string | null;

  /** Owner 2026-10-04/05: the client's choice — a level, or `by_date`
   * (see deadlineAt); null when not set. */
  @ApiPropertyOptional({
    enum: CASE_URGENCIES,
    enumName: 'CaseUrgency',
    nullable: true,
  })
  urgency?: CaseUrgency | null;

  /** Owner 2026-10-05: the level the case reads as today (a dated case's
   * level follows from the days left; `overdue` once the date passed). */
  @ApiPropertyOptional({
    enum: CASE_URGENCY_LEVELS,
    enumName: 'CaseUrgencyLevel',
    nullable: true,
  })
  urgencyLevel?: CaseUrgencyLevel | null;

  /** Owner 2026-10-05: the date the client needs it by (YYYY-MM-DD). */
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-03',
  })
  deadlineAt?: string | null;

  /** Owner 2026-10-05: what the date is (court hearing, filing…). */
  @ApiPropertyOptional({
    enum: CASE_DEADLINE_KINDS,
    enumName: 'CaseDeadlineKind',
    nullable: true,
  })
  deadlineKind?: CaseDeadlineKind | null;

  @ApiProperty({ type: 'integer' })
  bidsCount!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  lastActivityAt!: string;
}

export interface CasePage {
  items: CaseSummaryDto[];
  nextCursor: string | null;
}

export class CaseDeletedDto {
  @ApiProperty({ default: true })
  deleted!: true;
}
