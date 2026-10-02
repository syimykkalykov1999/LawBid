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
  REFERRAL_TEXT_LIMITS,
  REWARD_TYPES,
  type RewardType,
} from './referrals.settings';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const REFERRAL_STATUSES = [
  'pending',
  'qualified',
  'rewarded',
  'rejected',
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

// ---- shared -----------------------------------------------------------

export class ReferralRewardDto {
  @ApiProperty({ enum: REWARD_TYPES, enumName: 'ReferralRewardType' })
  @IsIn(REWARD_TYPES)
  type!: RewardType;

  @ApiProperty({
    type: 'integer',
    description:
      'balance_cents: cents of credit; percent_first_invoice: percent; promotion_days: days.',
  })
  @IsInt()
  @Min(0)
  @Max(100_000)
  value!: number;
}

// ---- app --------------------------------------------------------------

export class ApplyReferralDto {
  @ApiProperty({ example: 'K7MX2QP', description: '6–8 characters.' })
  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  code!: string;
}

export class ReferralInviteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: REFERRAL_STATUSES, enumName: 'ReferralStatus' })
  status!: ReferralStatus;

  @ApiProperty({ enum: ['attorney', 'client'] })
  refereeRole!: string;

  @ApiProperty({ type: ReferralRewardDto, description: 'Your reward.' })
  reward!: ReferralRewardDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  qualifiedAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  rewardedAt!: string | null;
}

export class ReferredByDto {
  @ApiProperty({ enum: REFERRAL_STATUSES, enumName: 'ReferralStatus' })
  status!: ReferralStatus;

  @ApiProperty({ type: ReferralRewardDto, description: 'Your reward.' })
  reward!: ReferralRewardDto;
}

export class ReferralTextsDto {
  @ApiProperty({ maxLength: REFERRAL_TEXT_LIMITS.title })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(REFERRAL_TEXT_LIMITS.title)
  title!: string;

  @ApiProperty({ maxLength: REFERRAL_TEXT_LIMITS.summary })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(REFERRAL_TEXT_LIMITS.summary)
  summary!: string;

  @ApiProperty({
    maxLength: REFERRAL_TEXT_LIMITS.terms,
    description: 'Terms and conditions.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(REFERRAL_TEXT_LIMITS.terms)
  terms!: string;

  @ApiProperty({
    maxLength: REFERRAL_TEXT_LIMITS.shareMessage,
    description: 'Share sheet text; {{code}} and {{url}} are filled in.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(REFERRAL_TEXT_LIMITS.shareMessage)
  shareMessage!: string;
}

export class ReferralTextsByLangDto {
  @ApiProperty({ type: ReferralTextsDto })
  @ValidateNested()
  @Type(() => ReferralTextsDto)
  en!: ReferralTextsDto;

  @ApiProperty({ type: ReferralTextsDto })
  @ValidateNested()
  @Type(() => ReferralTextsDto)
  ru!: ReferralTextsDto;
}

export class ReferralMeDto {
  @ApiProperty({ description: 'Program switched on in the admin.' })
  enabled!: boolean;

  @ApiProperty({ example: 'K7MX2QP' })
  code!: string;

  @ApiProperty({ example: 'https://lawbid.app/r/K7MX2QP' })
  shareUrl!: string;

  @ApiProperty({ type: 'integer' })
  invited!: number;

  @ApiProperty({ type: 'integer', description: 'Qualified or rewarded.' })
  qualified!: number;

  @ApiProperty({ type: 'integer' })
  rewarded!: number;

  @ApiProperty({ type: [ReferralInviteDto], description: 'Latest 50.' })
  rewards!: ReferralInviteDto[];

  @ApiPropertyOptional({ type: ReferredByDto, nullable: true })
  referredBy!: ReferredByDto | null;

  @ApiProperty({ type: 'integer', description: 'Free case-promotion days.' })
  promotionCreditDays!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Percent off the first subscription invoice (0 = none).',
  })
  pendingDiscountPercent!: number;

  @ApiProperty({ type: 'integer', description: 'Days after sign-up.' })
  applyWindowDays!: number;

  @ApiProperty({ description: 'This user can still enter a code.' })
  canApply!: boolean;

  @ApiProperty({ type: ReferralRewardDto })
  inviterReward!: ReferralRewardDto;

  @ApiProperty({
    type: ReferralTextsDto,
    description:
      'Words written in the admin, in the user language (en or ru); shareMessage is ready to send.',
  })
  texts!: ReferralTextsDto;

  @ApiProperty({ enum: ['en', 'ru'], description: 'Language of `texts`.' })
  textsLanguage!: 'en' | 'ru';
}

export class ApplyReferralResultDto {
  @ApiProperty({ enum: REFERRAL_STATUSES, enumName: 'ReferralStatus' })
  status!: ReferralStatus;

  @ApiProperty({ type: ReferralRewardDto, description: 'Your reward.' })
  reward!: ReferralRewardDto;
}

// ---- admin ------------------------------------------------------------

export class AdminReferralIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminReferralsQueryDto {
  @ApiPropertyOptional({ enum: REFERRAL_STATUSES, enumName: 'ReferralStatus' })
  @IsOptional()
  @IsIn(REFERRAL_STATUSES)
  status?: ReferralStatus;

  @ApiPropertyOptional({
    enum: ['attorney', 'client'],
    description: "Referee's role.",
  })
  @IsOptional()
  @IsIn(['attorney', 'client'])
  role?: 'attorney' | 'client';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  referrerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  refereeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdminReferralUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  role!: string | null;
}

export class AdminReferralRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: REFERRAL_STATUSES, enumName: 'ReferralStatus' })
  status!: ReferralStatus;

  @ApiProperty({ type: AdminReferralUserDto })
  referrer!: AdminReferralUserDto;

  @ApiProperty({ type: AdminReferralUserDto })
  referee!: AdminReferralUserDto;

  @ApiProperty()
  referrerRole!: string;

  @ApiProperty()
  refereeRole!: string;

  @ApiProperty({ type: ReferralRewardDto })
  referrerReward!: ReferralRewardDto;

  @ApiProperty({ type: ReferralRewardDto })
  refereeReward!: ReferralRewardDto;

  @ApiProperty({ description: 'Referrer reward already issued.' })
  referrerRewardIssued!: boolean;

  @ApiProperty({ description: 'Referee reward already issued.' })
  refereeRewardIssued!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  qualifiedAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  rewardedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectedReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class ReferralCountDto {
  @ApiProperty()
  key!: string;

  @ApiProperty({ type: 'integer' })
  count!: number;
}

export class AdminReferralStatsDto {
  @ApiProperty({ type: 'integer' })
  total!: number;

  @ApiProperty({ type: [ReferralCountDto] })
  byStatus!: ReferralCountDto[];

  @ApiProperty({ type: [ReferralCountDto], description: "Referee's role." })
  byRole!: ReferralCountDto[];

  @ApiProperty({ type: 'integer', description: 'Credit issued, cents.' })
  balanceCentsIssued!: number;

  @ApiProperty({ type: 'integer', description: 'Promotion days issued.' })
  promotionDaysIssued!: number;

  @ApiProperty({ type: 'integer', description: 'Promotion days spent.' })
  promotionDaysUsed!: number;
}

export class AdminReferralReasonDto {
  @ApiProperty({ minLength: 10, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason!: string;
}

export class ReferralSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    type: ReferralRewardDto,
    description: 'Attorney who invited (balance_cents).',
  })
  @ValidateNested()
  @Type(() => ReferralRewardDto)
  attorneyReferrerReward!: ReferralRewardDto;

  @ApiProperty({
    type: ReferralRewardDto,
    description:
      'Invited attorney (percent_first_invoice or balance_cents); qualifies on the first paid invoice.',
  })
  @ValidateNested()
  @Type(() => ReferralRewardDto)
  attorneyRefereeReward!: ReferralRewardDto;

  @ApiProperty({
    type: ReferralRewardDto,
    description: 'Client who invited (promotion_days).',
  })
  @ValidateNested()
  @Type(() => ReferralRewardDto)
  clientReferrerReward!: ReferralRewardDto;

  @ApiProperty({
    type: ReferralRewardDto,
    description:
      'Invited client (promotion_days); qualifies on the first case.',
  })
  @ValidateNested()
  @Type(() => ReferralRewardDto)
  clientRefereeReward!: ReferralRewardDto;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 90, default: 14 })
  @IsInt()
  @Min(1)
  @Max(90)
  applyWindowDays!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 100000,
    default: 0,
    description: 'Most people one user can invite; 0 = no limit.',
  })
  @IsInt()
  @Min(0)
  @Max(100000)
  maxInvitesPerReferrer!: number;

  @ApiProperty({ type: ReferralTextsByLangDto })
  @ValidateNested()
  @Type(() => ReferralTextsByLangDto)
  texts!: ReferralTextsByLangDto;
}

export class AdminReferralCodeRowDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ type: String, nullable: true }) ownerName!: string | null;
  @ApiProperty({ type: String, nullable: true }) ownerEmail!: string | null;
  @ApiProperty({ type: 'integer' }) invited!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminReferralCodesQueryDto {
  @ApiPropertyOptional({
    description: 'Code prefix, or owner name / email.',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class SetReferralCodeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    description:
      'Your own word: 4-24 letters or digits (case does not matter).',
    example: 'SIMA2026',
  })
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,24}$/, {
    message: 'code must be 4-24 letters or digits',
  })
  code!: string;

  @ApiProperty({ minLength: 10, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason!: string;
}
