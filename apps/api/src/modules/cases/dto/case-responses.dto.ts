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

  @ApiProperty({ description: '320 px preview.' })
  previewUrl!: string;
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
}

/** One card of GET /users/me/cases (docs/04 §11.1). */
export class CaseSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

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
