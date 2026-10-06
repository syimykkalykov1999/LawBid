import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
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
import { GOAL_METRICS, type GoalMetric } from './country-partners.rules';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const COUNTRY_PARTNER_STATUSES = [
  'active',
  'paused',
  'disabled',
] as const;
export type CountryPartnerStatus = (typeof COUNTRY_PARTNER_STATUSES)[number];

export class CountryPartnerIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class CountryPartnerGoalDto {
  @ApiProperty({ enum: GOAL_METRICS, enumName: 'CountryPartnerGoalMetric' })
  @IsIn(GOAL_METRICS)
  metric!: GoalMetric;

  @ApiProperty({
    type: 'integer',
    description: 'People, or cents for revenue_cents.',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  target!: number;

  @ApiProperty({ example: '2026-12-31' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  deadline!: string;
}

export class CountryPartnerGoalViewDto extends CountryPartnerGoalDto {
  @ApiProperty({ type: 'integer' })
  progress!: number;

  @ApiProperty({ enum: ['on_track', 'met', 'missed'] })
  state!: 'on_track' | 'met' | 'missed';
}

export class CreateCountryPartnerDto {
  @ApiProperty({ example: 'CA' })
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @ApiProperty({ description: 'Company or person (contract party).' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  contact?: string | null;

  @ApiProperty({
    description: "The partner's sign-in e-mail (new admin account).",
  })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ description: 'Login for the new account.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  login?: string;

  @ApiPropertyOptional({ description: 'Password for the new account.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @ApiProperty({ description: 'Share of net revenue, percent (0.01–90).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(90)
  sharePercent!: number;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Staff limit (default 10).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxAdmins?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  contractStartsAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  contractEndsAt?: Date | null;

  @ApiPropertyOptional({ type: [CountryPartnerGoalDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CountryPartnerGoalDto)
  goals?: CountryPartnerGoalDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

/** Changes that need no 2FA (no money). */
export class UpdateCountryPartnerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  contact?: string | null;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxAdmins?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  contractStartsAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  contractEndsAt?: Date | null;

  @ApiPropertyOptional({ type: [CountryPartnerGoalDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CountryPartnerGoalDto)
  goals?: CountryPartnerGoalDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class SetCountryPartnerShareDto {
  @ApiProperty({ description: 'Percent (0.01–90).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(90)
  sharePercent!: number;
}

export class SetCountryPartnerPayoutsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class SetCountryPartnerStatusDto {
  @ApiProperty({
    enum: COUNTRY_PARTNER_STATUSES,
    enumName: 'CountryPartnerStatus',
    description:
      'paused = payouts wait, the team keeps working; disabled = the whole team is signed out and blocked, payouts stop.',
  })
  @IsIn(COUNTRY_PARTNER_STATUSES)
  status!: CountryPartnerStatus;
}

export class CountryPartnerContractDto {
  @ApiProperty({ type: 'integer' })
  version!: number;

  @ApiProperty()
  text!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

export class UpdateCountryPartnerContractDto {
  @ApiProperty({
    description:
      'New text; saving makes a new version every partner accepts again.',
  })
  @IsString()
  @MinLength(50)
  @MaxLength(50_000)
  text!: string;
}

export class CountryPartnerSettlementDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-10' }) period!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: 'integer' }) grossCents!: number;
  @ApiProperty({ type: 'integer' }) refundsCents!: number;
  @ApiProperty({ type: 'integer' }) feesCents!: number;
  @ApiProperty({ type: 'integer' }) netCents!: number;
  @ApiProperty() sharePercent!: number;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({
    description: 'held · zero · pending (in payroll) · paid · canceled',
  })
  status!: string;
}

export class CountryPartnerMonthDto {
  @ApiProperty() currency!: string;
  @ApiProperty({ type: 'integer' }) grossCents!: number;
  @ApiProperty({ type: 'integer' }) refundsCents!: number;
  @ApiProperty({ type: 'integer' }) feesCents!: number;
  @ApiProperty({ type: 'integer' }) netCents!: number;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
}

export class CountryPartnerTeamMemberDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() role!: string;
  @ApiProperty({ enum: ['active', 'disabled'] }) status!: 'active' | 'disabled';
  @ApiProperty() lead!: boolean;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
  })
  permissions!: Record<string, 'view' | 'manage'>;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: string | null;
}

export class CountryPartnerRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() countryName!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) contact!: string | null;
  @ApiProperty({ format: 'uuid' }) leadAdminId!: string;
  @ApiProperty() leadEmail!: string;
  @ApiProperty() sharePercent!: number;
  @ApiProperty({
    enum: COUNTRY_PARTNER_STATUSES,
    enumName: 'CountryPartnerStatus',
  })
  status!: CountryPartnerStatus;
  @ApiProperty({ type: 'integer' }) maxAdmins!: number;
  @ApiProperty({ type: 'integer' }) teamSize!: number;
  @ApiProperty() payoutsEnabled!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  contractStartsAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  contractEndsAt!: string | null;
  @ApiProperty({ type: 'integer', nullable: true })
  contractVersion!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  contractAcceptedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class CountryPartnerDetailDto extends CountryPartnerRowDto {
  @ApiProperty({ type: [CountryPartnerGoalViewDto] })
  goals!: CountryPartnerGoalViewDto[];

  @ApiProperty({ type: [CountryPartnerTeamMemberDto] })
  team!: CountryPartnerTeamMemberDto[];

  @ApiProperty({ type: [CountryPartnerSettlementDto] })
  settlements!: CountryPartnerSettlementDto[];

  @ApiProperty({
    type: [CountryPartnerMonthDto],
    description: 'This month so far.',
  })
  currentMonth!: CountryPartnerMonthDto[];
}

/** What the partner's own team sees (Партнёр → Мой кабинет). */
export class CountryPartnerPortalDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() countryName!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    enum: COUNTRY_PARTNER_STATUSES,
    enumName: 'CountryPartnerStatus',
  })
  status!: CountryPartnerStatus;
  @ApiProperty() lead!: boolean;
  @ApiProperty() sharePercent!: number;
  @ApiProperty({ type: 'integer' }) maxAdmins!: number;
  @ApiProperty({ type: 'integer' }) teamSize!: number;
  @ApiProperty() payoutsEnabled!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  contractEndsAt!: string | null;
  @ApiProperty({
    description: 'The lead must accept the current contract first.',
  })
  contractPending!: boolean;
  @ApiProperty({ type: CountryPartnerContractDto })
  contract!: CountryPartnerContractDto;
  @ApiProperty({ type: [CountryPartnerGoalViewDto] })
  goals!: CountryPartnerGoalViewDto[];
  @ApiProperty({
    description: 'The money report is shown (lead or accountant).',
  })
  canSeeReport!: boolean;
  @ApiProperty({ type: [CountryPartnerSettlementDto] })
  settlements!: CountryPartnerSettlementDto[];
  @ApiProperty({ type: [CountryPartnerMonthDto] })
  currentMonth!: CountryPartnerMonthDto[];
}

export class AcceptCountryPartnerContractDto {
  @ApiProperty({ type: 'integer', description: 'The version being accepted.' })
  @IsInt()
  @Min(1)
  version!: number;
}
