import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CLIENT_RULES,
  COMMISSION_KINDS,
  COMMISSION_STATUSES,
  JOIN_MODES,
  MAX_HOLD_DAYS,
  MAX_RATE_CENTS,
  PARTNER_STATUSES,
  PARTNER_TEXT_LIMITS,
  type ClientRule,
  type CommissionKind,
  type CommissionStatus,
  type JoinMode,
  type PartnerStatus,
} from './partners.settings';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

/** Referred user as the partner (app) and the admin see them. */
export const REFERRED_STATUSES = [
  'joined',
  'qualified',
  'paid',
  'reversed',
] as const;
export type ReferredStatus = (typeof REFERRED_STATUSES)[number];

// ---- shared -----------------------------------------------------------

export class PartnerRatesDto {
  @ApiProperty({ type: 'integer', description: 'Per paying attorney, cents.' })
  attorneyRateCents!: number;

  @ApiProperty({ type: 'integer', description: 'Per qualified client, cents.' })
  clientRateCents!: number;

  @ApiProperty({ type: 'integer', description: 'Fixed monthly base, cents.' })
  monthlyBaseCents!: number;

  @ApiProperty({ enum: CLIENT_RULES, enumName: 'PartnerClientRule' })
  clientRule!: ClientRule;

  @ApiProperty({ type: 'integer', description: 'Anti-fraud hold, days.' })
  holdDays!: number;
}

export class PartnerTotalsDto {
  @ApiProperty({ type: 'integer', description: 'Held (in the check), cents.' })
  heldCents!: number;

  @ApiProperty({ type: 'integer', description: 'Approved, awaiting payout.' })
  approvedCents!: number;

  @ApiProperty({ type: 'integer' })
  paidCents!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Accrued this month (any status but reversed).',
  })
  thisMonthCents!: number;

  @ApiProperty({
    type: 'integer',
    description: 'People who joined by the link.',
  })
  referredCount!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Of them, earned a commission.',
  })
  qualifiedCount!: number;
}

export class PartnerReferredUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: ['attorney', 'client'] })
  role!: string;

  @ApiProperty({ enum: REFERRED_STATUSES, enumName: 'PartnerReferredStatus' })
  status!: ReferredStatus;

  @ApiProperty({
    type: 'integer',
    description: 'Commission for this person, cents (0 until qualified).',
  })
  amountCents!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  joinedAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  qualifiedAt!: string | null;
}

export class PartnerCommissionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: COMMISSION_KINDS, enumName: 'PartnerCommissionKind' })
  kind!: CommissionKind;

  @ApiProperty({ type: 'integer', description: 'Cents; negative = deduction.' })
  amountCents!: number;

  @ApiProperty({
    enum: COMMISSION_STATUSES,
    enumName: 'PartnerCommissionStatus',
  })
  status!: CommissionStatus;

  @ApiProperty({ example: '2026-10', description: 'Payroll period.' })
  period!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  referredUserId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  holdUntil!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  approvedAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  paidAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  payoutRef!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  reversedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  reversedReason!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class PartnerTextsDto {
  @ApiProperty({ maxLength: PARTNER_TEXT_LIMITS.title })
  @Transform(trim)
  @IsString()
  @MaxLength(PARTNER_TEXT_LIMITS.title)
  title!: string;

  @ApiProperty({ maxLength: PARTNER_TEXT_LIMITS.summary })
  @Transform(trim)
  @IsString()
  @MaxLength(PARTNER_TEXT_LIMITS.summary)
  summary!: string;
}

export class PartnerTextsByLangDto {
  @ApiProperty({ type: PartnerTextsDto })
  @ValidateNested()
  @Type(() => PartnerTextsDto)
  en!: PartnerTextsDto;

  @ApiProperty({ type: PartnerTextsDto })
  @ValidateNested()
  @Type(() => PartnerTextsDto)
  ru!: PartnerTextsDto;
}

// ---- app --------------------------------------------------------------

/** POST /partners/me/join. */
export class JoinPartnerDto {
  @ApiProperty({
    description:
      'The partner read and accepts the partner rules (GET /legal/settings texts.partnerTerms). Must be true.',
  })
  @IsBoolean()
  termsAccepted!: boolean;
}

/** Owner 2026-10-05 (legal): the partner's words plus the FTC disclosure
 * and the rules (from legal.settings, in the user's language). */
export class PartnerMeTextsDto extends PartnerTextsDto {
  @ApiProperty({
    description:
      'Say it is a paid link in every post (FTC Endorsement Guides).',
  })
  disclosure!: string;

  @ApiProperty({ description: 'The partner rules, plain text.' })
  terms!: string;
}

export class PartnerMeDto {
  @ApiProperty({
    description:
      'Program switched on by the owner. Off: the app hides the section.',
  })
  enabled!: boolean;

  @ApiProperty({ description: 'False for everyone who is not a partner.' })
  isPartner!: boolean;

  @ApiProperty({
    description:
      'The user may ask to become a partner right now (program on, joining not closed, not a partner yet).',
  })
  canJoin!: boolean;

  @ApiProperty({
    enum: JOIN_MODES,
    enumName: 'PartnerJoinMode',
    description: 'open: the link at once; approval: the admin confirms first.',
  })
  joinMode!: JoinMode;

  @ApiPropertyOptional({
    enum: PARTNER_STATUSES,
    enumName: 'PartnerStatus',
    nullable: true,
  })
  status!: PartnerStatus | null;

  @ApiProperty({ description: 'Referral code (same as the referral screen).' })
  code!: string;

  @ApiProperty()
  shareUrl!: string;

  @ApiProperty({ type: PartnerRatesDto })
  rates!: PartnerRatesDto;

  @ApiProperty({ type: PartnerTotalsDto })
  totals!: PartnerTotalsDto;

  @ApiProperty({
    type: [PartnerReferredUserDto],
    description: 'Newest first, up to 200.',
  })
  referred!: PartnerReferredUserDto[];

  @ApiProperty({
    type: [PartnerCommissionDto],
    description: 'Newest first, up to 200.',
  })
  commissions!: PartnerCommissionDto[];

  @ApiProperty({
    type: PartnerMeTextsDto,
    description:
      "Owner's words, the disclosure and the rules in the user's language.",
  })
  texts!: PartnerMeTextsDto;

  @ApiProperty({ description: 'Current version of the partner rules.' })
  termsVersion!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Version the partner accepted; null = not accepted yet (the app shows the rules with an Accept button, POST /partners/me/accept-terms).',
  })
  termsAcceptedVersion!: string | null;

  @ApiProperty({
    description: 'A W-9 (or W-8) is needed before the first payout.',
  })
  w9Required!: boolean;

  @ApiProperty({ description: 'The admin marked the W-9 as received.' })
  w9Received!: boolean;
}

// ---- admin ------------------------------------------------------------

export class PartnerSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    enum: JOIN_MODES,
    enumName: 'PartnerJoinMode',
    description:
      'open: anyone joins at once; approval: requests wait for the admin; closed: only the admin adds partners. Omitted = keep the current mode.',
  })
  @IsOptional()
  @IsIn(JOIN_MODES)
  joinMode?: JoinMode;

  @ApiProperty({ type: 'integer' })
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  attorneyRateCents!: number;

  @ApiProperty({ type: 'integer' })
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  clientRateCents!: number;

  @ApiProperty({ enum: CLIENT_RULES, enumName: 'PartnerClientRule' })
  @IsIn(CLIENT_RULES)
  clientRule!: ClientRule;

  @ApiProperty({ type: 'integer' })
  @IsInt()
  @Min(0)
  @Max(MAX_HOLD_DAYS)
  holdDays!: number;

  @ApiPropertyOptional({
    description:
      'Require a W-9 (or W-8) before the first payout. Omitted = keep the current value.',
  })
  @IsOptional()
  @IsBoolean()
  requireW9?: boolean;

  @ApiProperty({ type: PartnerTextsByLangDto })
  @ValidateNested()
  @Type(() => PartnerTextsByLangDto)
  texts!: PartnerTextsByLangDto;
}

export class AdminPartnerIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminPartnerReasonDto {
  @ApiPropertyOptional({ type: String, maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason = '';
}

export class AdminPartnerUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  role!: string | null;
}

export class AdminPartnerExternalDto {
  @ApiProperty({ description: 'How the admin knows the blogger.' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  contact!: string | null;
}

export class AdminPartnerRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: AdminPartnerUserDto })
  user!: AdminPartnerUserDto;

  @ApiProperty({ enum: PARTNER_STATUSES, enumName: 'PartnerStatus' })
  status!: PartnerStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  label!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  shareUrl!: string;

  @ApiProperty({
    type: PartnerRatesDto,
    description: 'Effective (own or default).',
  })
  rates!: PartnerRatesDto;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Own override; null = default.',
  })
  attorneyRateCents!: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  clientRateCents!: number | null;

  @ApiPropertyOptional({
    enum: CLIENT_RULES,
    enumName: 'PartnerClientRule',
    nullable: true,
  })
  clientRule!: ClientRule | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  holdDays!: number | null;

  @ApiProperty({ type: PartnerTotalsDto })
  totals!: PartnerTotalsDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  endedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the partner accepted the rules in the app.',
  })
  termsAcceptedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  termsVersion!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'W-9 (or W-8) received; null blocks payouts while requireW9 is on.',
  })
  w9ReceivedAt!: string | null;

  @ApiProperty({
    description: 'Owner 2026-10-05 («Продвижение»): may create demo accounts.',
  })
  demoAccess!: boolean;

  @ApiProperty({
    type: AdminPartnerExternalDto,
    nullable: true,
    description: 'Set for a partner without an app account (blogger).',
  })
  external!: AdminPartnerExternalDto | null;
}

export class AdminPartnerReferredUserDto extends PartnerReferredUserDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ format: 'uuid' })
  referralId!: string;

  @ApiProperty({
    description: 'Referral row status (pending/qualified/rewarded/rejected).',
  })
  referralStatus!: string;
}

export class AdminPartnerCommissionRowDto extends PartnerCommissionDto {
  @ApiProperty({ format: 'uuid' })
  partnerId!: string;

  @ApiProperty({ type: AdminPartnerUserDto })
  partner!: AdminPartnerUserDto;

  @ApiPropertyOptional({ type: AdminPartnerUserDto, nullable: true })
  referredUser!: AdminPartnerUserDto | null;

  @ApiProperty()
  eventRef!: string;
}

export class AdminPartnerDetailDto {
  @ApiProperty({ type: AdminPartnerRowDto })
  partner!: AdminPartnerRowDto;

  @ApiProperty({ type: [AdminPartnerReferredUserDto] })
  referred!: AdminPartnerReferredUserDto[];

  @ApiProperty({
    type: [AdminPartnerCommissionRowDto],
    description: 'Newest first, up to 500.',
  })
  commissions!: AdminPartnerCommissionRowDto[];
}

export class AdminPartnersQueryDto {
  @ApiPropertyOptional({ enum: PARTNER_STATUSES, enumName: 'PartnerStatus' })
  @IsOptional()
  @IsIn(PARTNER_STATUSES)
  status?: PartnerStatus;

  @ApiPropertyOptional({ description: 'Name, email, label or code.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdminPartnerCommissionsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  partnerId?: string;

  @ApiPropertyOptional({
    enum: COMMISSION_STATUSES,
    enumName: 'PartnerCommissionStatus',
  })
  @IsOptional()
  @IsIn(COMMISSION_STATUSES)
  status?: CommissionStatus;

  @ApiPropertyOptional({
    enum: COMMISSION_KINDS,
    enumName: 'PartnerCommissionKind',
  })
  @IsOptional()
  @IsIn(COMMISSION_KINDS)
  kind?: CommissionKind;

  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

class PartnerFieldsDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'null = program default.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  attorneyRateCents?: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  clientRateCents?: number | null;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  monthlyBaseCents?: number;

  @ApiPropertyOptional({
    enum: CLIENT_RULES,
    enumName: 'PartnerClientRule',
    nullable: true,
  })
  @IsOptional()
  @IsIn(CLIENT_RULES)
  clientRule?: ClientRule | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_HOLD_DAYS)
  holdDays?: number | null;
}

export class CreatePartnerDto extends PartnerFieldsDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'An existing user account. Leave out and give externalName for a blogger without an account.',
  })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Owner 2026-10-05: partner without an app account (blogger).',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  externalName?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Instagram, phone, e-mail…',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  externalContact?: string;

  @ApiPropertyOptional({
    description:
      'Own word as the referral code (4–24 letters/digits); default = keep/generate.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(4)
  @MaxLength(24)
  code?: string;

  @ApiPropertyOptional({ type: String, maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason = '';
}

export class UpdatePartnerDto extends PartnerFieldsDto {
  @ApiPropertyOptional({ enum: PARTNER_STATUSES, enumName: 'PartnerStatus' })
  @IsOptional()
  @IsIn(PARTNER_STATUSES)
  status?: PartnerStatus;

  @ApiPropertyOptional({
    description: 'true = W-9 received now; false = clear it.',
  })
  @IsOptional()
  @IsBoolean()
  w9Received?: boolean;

  @ApiPropertyOptional({
    description: 'Owner 2026-10-05 («Продвижение»): may create demo accounts.',
  })
  @IsOptional()
  @IsBoolean()
  demoAccess?: boolean;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  externalName?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  externalContact?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason = '';
}

export class AdminPartnerAdjustmentDto {
  @ApiProperty({
    type: 'integer',
    description: 'Cents; negative deducts (bonus, penalty, correction).',
  })
  @IsInt()
  @Min(-MAX_RATE_CENTS)
  @Max(MAX_RATE_CENTS)
  amountCents!: number;

  @ApiProperty({ maxLength: 300, description: 'Shown to the partner.' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;

  @ApiPropertyOptional({ type: String, maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason = '';
}

export class AdminPartnerPayDto {
  @ApiPropertyOptional({ type: String, maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason = '';

  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Transfer / payroll reference.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  payoutRef?: string;

  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Only this period; default = everything approved.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;
}

export class AdminPartnerPayResultDto {
  @ApiProperty({ type: 'integer' })
  count!: number;

  @ApiProperty({ type: 'integer' })
  totalCents!: number;
}

export class AdminPartnerStatsDto {
  @ApiProperty({ type: 'integer' })
  partners!: number;

  @ApiProperty({ type: 'integer' })
  active!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Requests waiting for the admin.',
  })
  pending!: number;

  @ApiProperty({ type: 'integer' })
  referredCount!: number;

  @ApiProperty({ type: 'integer' })
  heldCents!: number;

  @ApiProperty({ type: 'integer' })
  approvedCents!: number;

  @ApiProperty({ type: 'integer' })
  paidCents!: number;

  @ApiProperty({ type: 'integer' })
  thisMonthCents!: number;
}

/** Owner 2026-10-05: attach a real account to a partner created without one. */
export class LinkPartnerUserDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;

  @ApiPropertyOptional({ type: String, maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason = '';
}
