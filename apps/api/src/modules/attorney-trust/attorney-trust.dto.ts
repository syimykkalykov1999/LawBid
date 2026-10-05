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
  BADGE_STATUSES,
  BULK_TRUST_ACTIONS,
  DOCUMENT_REQUEST_TEMPLATES,
  MANUAL_BADGE_STATUSES,
  QUEUE_REASONS,
  TRUST_NOTE_MAX,
  TRUST_PRESETS,
  type BadgeStatus,
  type BulkTrustAction,
  type DocumentRequestTemplate,
  type ManualBadgeStatus,
  type TrustPreset,
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
 * Owner 2026-10-05 07:00: one license as the verifier works it — a button
 * that opens the state bar's page (the number already in the URL where the
 * state allows it, else the search page + «Скопировать номер»), and
 * whether this number is on the block list.
 */
export class BarLookupDto {
  @ApiProperty()
  stateCode!: string;

  @ApiProperty()
  stateName!: string;

  @ApiProperty()
  barNumber!: string;

  @ApiProperty({ description: 'pending / verified / rejected …' })
  licenseStatus!: string;

  @ApiProperty({ type: String, nullable: true })
  url!: string | null;

  @ApiProperty({
    description:
      'True: the page opens straight on this number. False: a search page, paste the number.',
  })
  prefilled!: boolean;

  @ApiProperty({ description: 'This number is on the block list right now.' })
  blocked!: boolean;
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

  @ApiProperty({
    enum: BADGE_STATUSES,
    description: 'The badge as the admin manages it (owner 2026-10-05).',
  })
  badgeStatus!: BadgeStatus;

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

  @ApiProperty({ type: [BarLookupDto] })
  lookups!: BarLookupDto[];

  @ApiProperty({
    description: 'One of the licenses is on the block list (owner 07:00).',
  })
  blocked!: boolean;

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

export class TrustStatusCountDto {
  @ApiProperty({ enum: BADGE_STATUSES })
  status!: BadgeStatus;

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

  @ApiProperty({ description: 'Master switch `trust.enabled`.' })
  enabled!: boolean;

  @ApiProperty({
    description: 'Staff review `trust.manual_review`; false = queue paused.',
  })
  manualReview!: boolean;

  @ApiProperty({
    type: [TrustStatusCountDto],
    description: 'Attorneys per badge status, same order as the enum.',
  })
  byStatus!: TrustStatusCountDto[];

  @ApiProperty({
    type: 'integer',
    description: 'Bar numbers on the block list right now (owner 07:00).',
  })
  blockedBarNumbers!: number;
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

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  to?: string;
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

  @ApiProperty({ type: [BarLookupDto] })
  lookups!: BarLookupDto[];

  @ApiProperty({ description: 'One of the licenses is on the block list.' })
  blocked!: boolean;

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

  @ApiProperty({ enum: BADGE_STATUSES })
  badgeStatus!: BadgeStatus;
}

/** One row of «Галочки → Адвокаты»: every attorney with their badge status. */
export class TrustAttorneyListItemDto {
  @ApiProperty({ type: AdminTrustAttorneyDto })
  attorney!: AdminTrustAttorneyDto;

  @ApiProperty({ type: 'integer' })
  level!: number;

  @ApiProperty({ enum: BADGE_STATUSES })
  badgeStatus!: BadgeStatus;

  @ApiProperty({ description: 'Blue check shown in the app right now.' })
  badge!: boolean;

  @ApiProperty({ type: [String], enum: REQUIREMENTS })
  missing!: RequirementName[];

  @ApiProperty({ type: [String], enum: QUEUE_REASONS })
  reasons!: string[];

  @ApiProperty({ type: TrustHoldsDto })
  holds!: TrustHoldsDto;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  staffClearedAt!: string | null;

  @ApiProperty({ type: StaffAdminDto, nullable: true })
  staffClearedBy!: StaffAdminDto | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  documentsRequestedAt!: string | null;

  @ApiProperty({ type: 'integer' })
  complaintsTotal!: number;

  @ApiProperty({ type: [BarLookupDto] })
  lookups!: BarLookupDto[];

  @ApiProperty({ description: 'One of the licenses is on the block list.' })
  blocked!: boolean;
}

export class TrustAttorneyListQueryDto {
  @ApiPropertyOptional({ enum: BADGE_STATUSES })
  @IsOptional()
  @IsIn([...BADGE_STATUSES])
  status?: BadgeStatus;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 500 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/** Manual badge status change (owner 2026-10-05): a reason is required. */
export class TrustSetStatusDto {
  @ApiProperty({ enum: MANUAL_BADGE_STATUSES })
  @IsIn([...MANUAL_BADGE_STATUSES])
  status!: ManualBadgeStatus;

  @ApiProperty({ minLength: 3, maxLength: TRUST_NOTE_MAX })
  @Transform(trim)
  @IsString()
  @Length(3, TRUST_NOTE_MAX)
  note!: string;
}

export class TrustPresetDto {
  @ApiProperty({
    enum: TRUST_PRESETS,
    description:
      'off = «Выключить всё»; soft / standard / strict; all = «Включить всё».',
  })
  @IsIn([...TRUST_PRESETS])
  preset!: TrustPreset;
}

export class StaffDecisionsQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  to?: string;
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
      'Master switch. Off = self-attested attorneys get the badge and payments at once; no holds, no queue.',
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    description:
      'Staff review. Off = automatic checks only; the documents requirement is ignored and the queue is paused, not lost.',
  })
  @IsBoolean()
  manualReview!: boolean;

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

  @ApiProperty({
    description:
      'Owner 2026-10-05 07:00: a rejection or a suspension also blocks the bar number for new accounts.',
  })
  @IsBoolean()
  blockOnReject!: boolean;

  @ApiProperty({
    description:
      'A block also refuses the e-mail and phone that were on the blocked account.',
  })
  @IsBoolean()
  blockContacts!: boolean;
}

// --- Owner 2026-10-05 07:00: «Заблокированные номера» ----------------------

export const BAR_BLOCK_STATUSES = ['active', 'unblocked'] as const;
export type BarBlockStatus = (typeof BAR_BLOCK_STATUSES)[number];

export class BarNumberBlockEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['blocked', 'unblocked', 'attempt'] })
  kind!: string;

  @ApiProperty({ description: 'admin / system / attorney' })
  actorType!: string;

  @ApiProperty({ type: StaffAdminDto, nullable: true })
  actor!: StaffAdminDto | null;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({ type: Object, additionalProperties: true })
  details!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** One blocked bar number: reason, who, history, who tried to use it. */
export class BarNumberBlockDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  stateCode!: string;

  @ApiProperty()
  barNumber!: string;

  @ApiProperty()
  active!: boolean;

  @ApiProperty()
  reason!: string;

  @ApiProperty({
    enum: ['staff_reject', 'verification_reject', 'suspend', 'manual'],
  })
  source!: string;

  @ApiProperty({ type: AdminTrustAttorneyDto, nullable: true })
  attorney!: AdminTrustAttorneyDto | null;

  @ApiProperty({ type: StaffAdminDto, nullable: true })
  blockedBy!: StaffAdminDto | null;

  @ApiProperty({ format: 'date-time' })
  blockedAt!: string;

  @ApiProperty()
  blockContacts!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Masked.' })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Masked.' })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  unblockedAt!: string | null;

  @ApiProperty({ type: StaffAdminDto, nullable: true })
  unblockedBy!: StaffAdminDto | null;

  @ApiProperty({ type: String, nullable: true })
  unblockReason!: string | null;

  @ApiProperty({
    type: 'integer',
    description: 'How many times someone tried to register it again.',
  })
  attempts!: number;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastAttemptAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lookupUrl!: string | null;

  @ApiProperty({ type: [BarNumberBlockEventDto] })
  events!: BarNumberBlockEventDto[];
}

export class BarNumberBlocksQueryDto {
  @ApiPropertyOptional({ enum: BAR_BLOCK_STATUSES })
  @IsOptional()
  @IsIn([...BAR_BLOCK_STATUSES])
  status?: BarBlockStatus;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 500 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class BlockBarNumberDto {
  @ApiProperty({ minLength: 2, maxLength: 2, example: 'CA' })
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(2, 2)
  stateCode!: string;

  @ApiProperty({ minLength: 1, maxLength: 32 })
  @Transform(trim)
  @IsString()
  @Length(1, 32)
  barNumber!: string;

  @ApiProperty({ minLength: 3, maxLength: TRUST_NOTE_MAX })
  @Transform(trim)
  @IsString()
  @Length(3, TRUST_NOTE_MAX)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Also block the e-mail / phone of the current holder.',
  })
  @IsOptional()
  @IsBoolean()
  blockContacts?: boolean;
}

export class UnblockBarNumberDto {
  @ApiProperty({
    minLength: 3,
    maxLength: TRUST_NOTE_MAX,
    description:
      'Why the block is lifted (what the person explained / proved).',
  })
  @Transform(trim)
  @IsString()
  @Length(3, TRUST_NOTE_MAX)
  reason!: string;
}

export class BarNumberBlockIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class TrustNoteDto {
  @ApiPropertyOptional({ maxLength: TRUST_NOTE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TRUST_NOTE_MAX)
  note?: string;
}

/** Release: with no flags both holds are lifted («Снять холд»). */
export class TrustReleaseDto extends TrustNoteDto {
  @ApiPropertyOptional({ description: 'Resume payments (default true).' })
  @IsOptional()
  @IsBoolean()
  payments?: boolean;

  @ApiPropertyOptional({ description: 'Resume bids (default true).' })
  @IsOptional()
  @IsBoolean()
  bids?: boolean;
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
