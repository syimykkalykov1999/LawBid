import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { BID_AMOUNT_MAX_CENTS } from '../../../bids/dto/bid-requests.dto';
import { BidAttorneySummaryDto } from '../../case-bids/dto/case-bids.dto';
import {
  CASE_DEADLINE_KINDS,
  CASE_URGENCIES,
  CASE_URGENCY_LEVELS,
  type CaseDeadlineKind,
  type CaseUrgency,
  type CaseUrgencyLevel,
} from '../../domain/case-urgency';
import { CaseBudgetDto, CaseDossierDto } from '../../dto/cases-feed.dto';

export const INVITE_MESSAGE_MAX = 1000;
export const INVITE_DECLINE_REASON_MAX = 500;
export const INVITES_PAGE_SIZE = 20;

/** Stored statuses plus `closed` (still pending, but the case no longer
 * takes bids) — `expired` is also derived from `expires_at`. */
export const INVITE_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired',
  'closed',
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** POST /cases/:id/invites (client). */
export class CreateInviteDto {
  @ApiProperty({ format: 'uuid', description: 'The attorney to invite.' })
  @IsUUID('all')
  attorneyId!: string;

  @ApiPropertyOptional({
    maxLength: INVITE_MESSAGE_MAX,
    description: 'A note to the attorney (no contacts).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(INVITE_MESSAGE_MAX)
  message?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: BID_AMOUNT_MAX_CENTS,
    description: 'The budget the client proposes, in cents.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(BID_AMOUNT_MAX_CENTS)
  budgetCents?: number;
}

/** POST /invites/:id/decline (attorney). */
export class DeclineInviteDto {
  @ApiPropertyOptional({ maxLength: INVITE_DECLINE_REASON_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(INVITE_DECLINE_REASON_MAX)
  reason?: string;
}

export class InviteIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

/** GET /invites (attorney). */
export class InviteListQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'all'],
    enumName: 'InviteListStatus',
    description: 'pending (default): waiting for an answer; all: history too.',
  })
  @IsOptional()
  @IsIn(['pending', 'all'])
  status?: 'pending' | 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

/** One invite as either side sees it. The attorney never sees the
 * client's identity here (released only after acceptance, docs/04 §8);
 * the client sees the invited attorney's public summary. */
export class CaseInviteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty({ format: 'uuid' })
  attorneyId!: string;

  @ApiProperty({ enum: INVITE_STATUSES, enumName: 'CaseInviteStatus' })
  status!: InviteStatus;

  @ApiProperty({ type: String, nullable: true })
  message!: string | null;

  @ApiProperty({ type: 'integer', nullable: true })
  budgetCents!: number | null;

  @ApiProperty({ type: String, nullable: true })
  declineReason!: string | null;

  @ApiProperty({
    description: "The case's practice is not one of the attorney's.",
  })
  outsidePractice!: boolean;

  @ApiProperty({
    description: "The attorney holds no verified licence in the case's states.",
  })
  outsideLicensedStates!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: "The attorney's bid that answered the invite.",
  })
  bidId!: string | null;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  decidedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty()
  caseTitle!: string;

  @ApiProperty({ description: 'cases.status' })
  caseStatus!: string;

  @ApiProperty({ description: "i18n key of the case's practice area." })
  casePracticeKey!: string;

  @ApiProperty({ type: String, isArray: true })
  caseStateCodes!: string[];

  /** Owner 2026-10-05: the dossier ("Case file 4 of 6") on the invite, so
   * the attorney sees what the client filled in before answering. Counts
   * only — the files open once the client accepts the attorney's bid. */
  @ApiPropertyOptional({ type: String, nullable: true })
  caseCity!: string | null;

  @ApiPropertyOptional({
    enum: CASE_URGENCIES,
    enumName: 'CaseUrgency',
    nullable: true,
  })
  caseUrgency!: CaseUrgency | null;

  /** Owner 2026-10-05: the level the case reads as today. */
  @ApiPropertyOptional({
    enum: CASE_URGENCY_LEVELS,
    enumName: 'CaseUrgencyLevel',
    nullable: true,
  })
  caseUrgencyLevel!: CaseUrgencyLevel | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  caseDeadlineAt!: string | null;

  @ApiPropertyOptional({
    enum: CASE_DEADLINE_KINDS,
    enumName: 'CaseDeadlineKind',
    nullable: true,
  })
  caseDeadlineKind!: CaseDeadlineKind | null;

  @ApiProperty({ type: CaseBudgetDto })
  caseBudget!: CaseBudgetDto;

  @ApiProperty({ type: CaseDossierDto })
  caseDossier!: CaseDossierDto;

  @ApiProperty({
    type: BidAttorneySummaryDto,
    nullable: true,
    description: 'The invited attorney (client view only).',
  })
  attorney!: BidAttorneySummaryDto | null;
}

export interface CaseInvitePage {
  items: CaseInviteDto[];
  nextCursor: string | null;
}
