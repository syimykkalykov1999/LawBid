import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BULK_TRUST_ACTIONS,
  DOCUMENT_REQUEST_TEMPLATES,
  QUEUE_REASONS,
  TRUST_NOTE_MAX,
  type BulkTrustAction,
  type DocumentRequestTemplate,
} from './attorney-trust.constants';

const REQUIREMENTS = ['registry', 'identity', 'documents'] as const;
export type RequirementName = (typeof REQUIREMENTS)[number];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class TrustSignalsDto {
  @ApiProperty({ description: 'Sworn statement accepted, licenses verified.' })
  selfAttested!: boolean;

  @ApiProperty({
    description:
      'The bar number was confirmed by the state registry or a verifier.',
  })
  licenseConfirmed!: boolean;

  @ApiProperty({ type: String, nullable: true, enum: ['registry', 'staff'] })
  licenseConfirmedBy!: 'registry' | 'staff' | null;

  @ApiProperty({ description: 'A verifier checked bar card + ID + selfie.' })
  documentsVerified!: boolean;

  @ApiProperty({ description: 'Stripe Connect KYC finished.' })
  stripeKyc!: boolean;

  @ApiProperty({
    description:
      'Stripe KYC finished AND its legal name matches the profile / registry.',
  })
  stripeIdentity!: boolean;

  @ApiProperty({ description: 'Documents verified or Stripe identity.' })
  identityConfirmed!: boolean;

  @ApiProperty({ enum: ['match', 'mismatch', 'unknown'] })
  nameCheck!: 'match' | 'mismatch' | 'unknown';

  @ApiProperty({
    description: 'Company account: the link to the firm is shown.',
  })
  firmLinkConfirmed!: boolean;
}

export class FirmLinkDto {
  @ApiProperty({ enum: ['none', 'pending', 'confirmed'] })
  status!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['registry', 'email', 'staff'],
  })
  source!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  at!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Firm e-mail domain the attorney confirmed.',
  })
  emailDomain!: string | null;
}

export class FirmEmailRequestDto {
  @ApiProperty({
    description: 'Your address at the firm (not a free mailbox).',
  })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class FirmEmailConfirmDto {
  @ApiProperty({ minLength: 6, maxLength: 6 })
  @Transform(trim)
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class FirmEmailResultDto {
  @ApiProperty()
  domain!: string;
}

export class TrustGateDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['requirements', 'hold', 'suspended'],
  })
  reason!: 'requirements' | 'hold' | 'suspended' | null;

  @ApiProperty({
    type: [String],
    enum: REQUIREMENTS,
    description: 'Enabled requirements the attorney has not met yet.',
  })
  missing!: RequirementName[];

  @ApiProperty({ type: 'integer' })
  current!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Hold code when paused.',
  })
  hold!: string | null;
}

export class RegistryLinkDto {
  @ApiProperty()
  stateCode!: string;

  @ApiProperty()
  stateName!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Where to check the bar number yourself.',
  })
  url!: string | null;
}

/**
 * What a client (or the attorney) sees: the level, what exactly was
 * checked and whether money can be sent through LawBid. Never says
 * "verified" for a level the facts do not support.
 */
export class PublicTrustDto {
  @ApiProperty({ format: 'uuid' })
  attorneyId!: string;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 3 })
  level!: number;

  @ApiProperty({ description: 'The blue check is shown.' })
  badge!: boolean;

  @ApiProperty({
    description:
      'Every requirement the owner switched on is met (or staff confirmed): the badge and payments are open.',
  })
  cleared!: boolean;

  @ApiProperty({ type: TrustSignalsDto })
  signals!: TrustSignalsDto;

  @ApiProperty({
    description: 'Client money can be sent through LawBid to this attorney.',
  })
  acceptsPayments!: boolean;

  @ApiProperty({ description: 'Bids and chat are open.' })
  canBid!: boolean;

  @ApiProperty({
    type: [RegistryLinkDto],
    description: 'One per licensed state.',
  })
  registryLinks!: RegistryLinkDto[];
}

export class TrustRequirementsDto {
  @ApiProperty({ description: 'Bar number matched the state registry.' })
  @IsBoolean()
  registry!: boolean;

  @ApiProperty({
    description:
      'Stripe KYC with the attorney as the verified person, or firm link.',
  })
  @IsBoolean()
  identity!: boolean;

  @ApiProperty({ description: 'Staff checked ID + selfie + bar card.' })
  @IsBoolean()
  documents!: boolean;
}

/** The attorney's own view: the public part plus what to do next. */
export class OwnTrustDto extends PublicTrustDto {
  @ApiProperty({ type: TrustGateDto })
  bidsGate!: TrustGateDto;

  @ApiProperty({ type: TrustGateDto })
  paymentsGate!: TrustGateDto;

  @ApiProperty({ type: TrustRequirementsDto })
  requirements!: TrustRequirementsDto;

  @ApiProperty({
    type: [String],
    enum: REQUIREMENTS,
    description: 'Requirements still missing for the badge and payments.',
  })
  missing!: RequirementName[];

  @ApiProperty({
    type: String,
    enum: ['self_declared', 'needs_staff', 'cleared', 'suspended'],
  })
  staffStatus!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: DOCUMENT_REQUEST_TEMPLATES,
    description: 'Staff asked for more documents (template).',
  })
  documentsRequested!: string | null;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Stripe payout delay LawBid applies at this level, days.',
  })
  payoutDelayDays!: number | null;

  @ApiProperty({
    type: [String],
    description:
      'What raises the level next: hold_review | registry_check | stripe_kyc | fix_name | firm_link | documents.',
  })
  nextSteps!: string[];

  @ApiProperty({ type: FirmLinkDto })
  firmLink!: FirmLinkDto;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Stripe business type when known.',
  })
  stripeBusinessType!: string | null;
}

// --- admin ------------------------------------------------------------------

export class TrustHoldsDto {
  @ApiProperty({ type: String, nullable: true })
  payments!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paymentsAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bids!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  bidsAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
}

export class TrustEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  kind!: string;

  @ApiProperty({ type: 'integer', nullable: true })
  fromLevel!: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  toLevel!: number | null;

  @ApiProperty()
  actorType!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  actorId!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  details!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class AdminTrustAttorneyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  verificationStatus!: string;
}

export class AdminTrustCardDto {
  @ApiProperty({ type: AdminTrustAttorneyDto })
  attorney!: AdminTrustAttorneyDto;

  @ApiProperty({ type: 'integer' })
  level!: number;

  @ApiProperty()
  badge!: boolean;

  @ApiProperty({ type: TrustSignalsDto })
  signals!: TrustSignalsDto;

  @ApiProperty({ type: TrustHoldsDto })
  holds!: TrustHoldsDto;

  @ApiProperty({ type: TrustGateDto })
  bidsGate!: TrustGateDto;

  @ApiProperty({ type: TrustGateDto })
  paymentsGate!: TrustGateDto;

  @ApiProperty()
  cleared!: boolean;

  @ApiProperty({ type: String, nullable: true, enum: ['auto', 'staff'] })
  clearedBy!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  staffClearedAt!: string | null;

  @ApiProperty({
    type: () => StaffAdminDto,
    nullable: true,
    description: 'Who pressed «Подтвердить» (stays after a suspension).',
  })
  staffClearedBy!: StaffAdminDto | null;

  @ApiProperty({
    type: String,
    enum: ['self_declared', 'needs_staff', 'cleared', 'suspended'],
  })
  staffStatus!: string;

  @ApiProperty({ type: [String], enum: QUEUE_REASONS })
  queueReasons!: string[];

  @ApiProperty({ type: [String], enum: REQUIREMENTS })
  missing!: RequirementName[];

  @ApiProperty({ type: TrustRequirementsDto })
  requirements!: TrustRequirementsDto;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  documentsRequestedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  documentsRequestedTemplate!: string | null;

  @ApiProperty({ type: String, nullable: true })
  stripeLegalName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'individual | company | …',
  })
  stripeBusinessType!: string | null;

  @ApiProperty({ type: String, nullable: true })
  stripeCompanyName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  stripeCompanyDomain!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Representative / owner compared with the profile.',
  })
  stripeRepresentative!: string | null;

  @ApiProperty({ type: FirmLinkDto })
  firmLink!: FirmLinkDto;

  @ApiProperty({ type: String, nullable: true })
  firmLinkNote!: string | null;

  @ApiProperty({ type: 'integer', nullable: true })
  payoutDelayDays!: number | null;

  @ApiProperty({ type: 'integer' })
  complaintsTotal!: number;

  @ApiProperty({ type: 'integer' })
  duplicateClaims!: number;

  @ApiProperty({ type: [RegistryLinkDto] })
  registryLinks!: RegistryLinkDto[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Latest verification request (its card).',
  })
  latestRequestId!: string | null;

  @ApiProperty({ type: [TrustEventDto] })
  events!: TrustEventDto[];
}

export class TrustHoldListItemDto {
  @ApiProperty({ type: AdminTrustAttorneyDto })
  attorney!: AdminTrustAttorneyDto;

  @ApiProperty({ type: 'integer' })
  level!: number;

  @ApiProperty({ type: TrustHoldsDto })
  holds!: TrustHoldsDto;

  @ApiProperty({ type: 'integer' })
  complaintsTotal!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Oldest hold.',
  })
  heldSince!: string;
}

export class TrustLevelCountDto {
  @ApiProperty({ type: 'integer' })
  level!: number;

  @ApiProperty({ type: 'integer' })
  attorneys!: number;
}

export class TrustStatsDto {
  @ApiProperty({ type: [TrustLevelCountDto] })
  byLevel!: TrustLevelCountDto[];

  @ApiProperty({ type: 'integer', description: 'Attorneys with any hold.' })
  held!: number;

  @ApiProperty({ type: 'integer' })
  withBadge!: number;

  @ApiProperty({ type: 'integer', description: 'Verified attorneys in all.' })
  verified!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Complaints in the last 30 days.',
  })
  complaints30d!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Attorneys cleared (badge and payments open).',
  })
  cleared!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Waiting for a person in the staff queue.',
  })
  inQueue!: number;
}

export class StaffAdminDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  role!: string | null;
}

/** Owner 2026-10-05: who approved whom — one row per admin. */
export class StaffDecisionStatsDto {
  @ApiProperty({ type: StaffAdminDto })
  admin!: StaffAdminDto;

  @ApiProperty({ type: 'integer', description: '«Подтвердить» pressed.' })
  cleared!: number;

  @ApiProperty({ type: 'integer' })
  uncleared!: number;

  @ApiProperty({ type: 'integer', description: '«Отклонить» pressed.' })
  rejected!: number;

  @ApiProperty({ type: 'integer' })
  documentsRequested!: number;

  @ApiProperty({ type: 'integer', description: 'Holds lifted.' })
  released!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Decisions under a minute after the previous one.',
  })
  fastDecisions!: number;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Median seconds between consecutive decisions in a sitting.',
  })
  medianSecondsBetween!: number | null;

  @ApiProperty({
    type: 'integer',
    description: 'Attorneys they cleared who drew a complaint afterwards.',
  })
  laterComplaints!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Attorneys they cleared who were suspended afterwards.',
  })
  laterSuspended!: number;

  @ApiProperty({ format: 'date-time' })
  firstDecisionAt!: string;

  @ApiProperty({ format: 'date-time' })
  lastDecisionAt!: string;
}

export class ClearedByItemDto {
  @ApiProperty({ type: AdminTrustAttorneyDto })
  attorney!: AdminTrustAttorneyDto;

  @ApiProperty({ type: 'integer' })
  level!: number;

  @ApiProperty({ format: 'date-time' })
  clearedAt!: string;

  @ApiProperty({ type: 'integer' })
  complaintsAfter!: number;

  @ApiProperty()
  suspendedAfter!: boolean;

  @ApiProperty({
    type: [String],
    description: 'Document types on the request they saw.',
  })
  documentsSeen!: string[];
}

export class ClearedByQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  adminId!: string;
}

/** One row of the staff queue («Борьба с мошенниками»). */
export class TrustQueueItemDto {
  @ApiProperty({ type: AdminTrustAttorneyDto })
  attorney!: AdminTrustAttorneyDto;

  @ApiProperty({ type: 'integer' })
  level!: number;

  @ApiProperty({ type: [String], enum: QUEUE_REASONS })
  reasons!: string[];

  @ApiProperty({ type: [String], enum: REQUIREMENTS })
  missing!: RequirementName[];

  @ApiProperty({ type: TrustSignalsDto })
  signals!: TrustSignalsDto;

  @ApiProperty({ type: TrustHoldsDto })
  holds!: TrustHoldsDto;

  @ApiProperty({ type: String, nullable: true })
  stripeBusinessType!: string | null;

  @ApiProperty({ type: String, nullable: true })
  stripeRepresentative!: string | null;

  @ApiProperty({ type: String, nullable: true })
  stripeCompanyName!: string | null;

  @ApiProperty({ type: [RegistryLinkDto] })
  registryLinks!: RegistryLinkDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Open the documents on this verification request.',
  })
  requestId!: string | null;

  @ApiProperty({ type: 'integer', description: 'Documents on that request.' })
  documentsCount!: number;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  documentsRequestedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  waitingSince!: string | null;
}

export class TrustQueueQueryDto {
  @ApiPropertyOptional({ enum: QUEUE_REASONS })
  @IsOptional()
  @IsIn([...QUEUE_REASONS])
  reason?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class DocumentRequestDto {
  @ApiProperty({ enum: DOCUMENT_REQUEST_TEMPLATES })
  @IsIn([...DOCUMENT_REQUEST_TEMPLATES])
  template!: DocumentRequestTemplate;

  @ApiPropertyOptional({ maxLength: TRUST_NOTE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TRUST_NOTE_MAX)
  note?: string;
}

export class BulkTrustDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  attorneyIds!: string[];

  @ApiProperty({ enum: BULK_TRUST_ACTIONS })
  @IsIn([...BULK_TRUST_ACTIONS])
  action!: BulkTrustAction;

  @ApiPropertyOptional({ enum: DOCUMENT_REQUEST_TEMPLATES })
  @IsOptional()
  @IsIn([...DOCUMENT_REQUEST_TEMPLATES])
  template?: DocumentRequestTemplate;

  @ApiPropertyOptional({ maxLength: TRUST_NOTE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TRUST_NOTE_MAX)
  note?: string;
}

export class BulkTrustResultDto {
  @ApiProperty({ type: 'integer' })
  done!: number;

  @ApiProperty({ type: [String], format: 'uuid' })
  failed!: string[];
}

export class TrustSettingsDto {
  @ApiProperty({
    description:
      'Require the bar number to match the state registry (or staff).',
  })
  @IsBoolean()
  requireRegistry!: boolean;

  @ApiProperty({
    description:
      'Require Stripe KYC with the attorney as the verified person (or a firm link).',
  })
  @IsBoolean()
  requireIdentity!: boolean;

  @ApiProperty({ description: 'Require staff-checked ID + selfie + bar card.' })
  @IsBoolean()
  requireDocuments!: boolean;

  @ApiProperty({ description: 'Bids too wait until the attorney is cleared.' })
  @IsBoolean()
  bidsRequireCleared!: boolean;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 30 })
  @IsInt()
  @Min(0)
  @Max(30)
  payoutDelayDays!: number;

  @ApiProperty()
  @IsBoolean()
  autoHoldOnComplaint!: boolean;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  complaintsToSuspend!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  complaintWindowDays!: number;

  @ApiProperty()
  @IsBoolean()
  autoHoldOnNameMismatch!: boolean;

  @ApiProperty()
  @IsBoolean()
  flagDuplicateClaims!: boolean;

  @ApiProperty({
    description:
      'Firm link counts when the registry firm equals the Stripe company.',
  })
  @IsBoolean()
  firmLinkAutoRegistry!: boolean;

  @ApiProperty({
    description:
      'Firm link counts after a code to an e-mail on the firm domain.',
  })
  @IsBoolean()
  firmLinkAutoEmail!: boolean;
}

export class TrustNoteDto {
  @ApiPropertyOptional({ maxLength: TRUST_NOTE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TRUST_NOTE_MAX)
  note?: string;
}

export class TrustHoldDto extends TrustNoteDto {
  @ApiProperty({ description: 'Pause / resume receiving payments.' })
  @IsBoolean()
  payments!: boolean;

  @ApiProperty({ description: 'Pause / resume new bids.' })
  @IsBoolean()
  bids!: boolean;
}

export class TrustAttorneyIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  attorneyId!: string;
}

export class RecomputeAllResultDto {
  @ApiProperty({ type: 'integer' })
  attorneys!: number;

  @ApiProperty({ type: 'integer' })
  changed!: number;
}
