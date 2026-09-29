import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ContactIssueStatus,
  ContactIssueType,
  ContactMethod,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** docs/04 §8.4 note / resolution comment cap (no spec figure; same
 * bound as review bodies, docs/02 §6.1). */
export const CONTACT_ISSUE_NOTE_MAX = 1000;

const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** GET /cases/:id/contacts (docs/04 §8.1): what the attorney whose bid was
 * accepted sees, only while their subscription/trial is active. */
export class ClientContactsDto {
  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty({ format: 'uuid' })
  bidId!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'E.164.' })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({
    enum: ContactMethod,
    enumName: 'ContactMethod',
    nullable: true,
  })
  contactMethod!: ContactMethod | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The client’s note on when to be contacted.',
  })
  contactNote!: string | null;

  @ApiProperty({
    format: 'date-time',
    description:
      'When the contacts were first disclosed (the accept transaction, §8.2).',
  })
  disclosedAt!: string;
}

/** POST /cases/:id/contact-issues body (docs/04 §8.4). */
export class CreateContactIssueDto {
  @ApiProperty({ enum: ContactIssueType, enumName: 'ContactIssueType' })
  @IsEnum(ContactIssueType)
  issueType!: ContactIssueType;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: CONTACT_ISSUE_NOTE_MAX,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(CONTACT_ISSUE_NOTE_MAX)
  note?: string | null;
}

export class ContactIssueReportDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty({ format: 'uuid' })
  bidId!: string;

  @ApiProperty({ enum: ContactIssueType, enumName: 'ContactIssueType' })
  issueType!: ContactIssueType;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ enum: ContactIssueStatus, enumName: 'ContactIssueStatus' })
  status!: ContactIssueStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  resolutionNote!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export const CONTACT_ISSUE_DECISIONS = ['confirmed', 'rejected'] as const;
export type ContactIssueDecision = (typeof CONTACT_ISSUE_DECISIONS)[number];

/** POST /admin/contact-issues/:id/resolve body (docs/04 §8.4: "решение
 * confirmed или rejected с комментарием"). */
export class ResolveContactIssueDto {
  @ApiProperty({ enum: CONTACT_ISSUE_DECISIONS })
  @IsIn(CONTACT_ISSUE_DECISIONS)
  decision!: ContactIssueDecision;

  @ApiProperty({ minLength: 1, maxLength: CONTACT_ISSUE_NOTE_MAX })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_ISSUE_NOTE_MAX)
  note!: string;
}

export class ContactIssueResolutionDto {
  @ApiProperty({ type: ContactIssueReportDto })
  report!: ContactIssueReportDto;

  @ApiProperty({
    description:
      "The client's confirmed reports after this decision (all cases).",
  })
  confirmedReports!: number;

  @ApiProperty({
    description:
      'True when this decision reached contacts.suspend_after_confirmed_reports and suspended the client.',
  })
  clientSuspended!: boolean;
}

export class ContactIssueIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}
