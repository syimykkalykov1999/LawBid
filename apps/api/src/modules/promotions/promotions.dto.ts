import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PROMOTION_STATUSES,
  type PromotionStatus,
} from './promotions.settings';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---- app --------------------------------------------------------------

export class PromotionCaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class PromotionQuoteQueryDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}

export class CreatePromotionDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Spend free days earned through referrals first.',
  })
  @IsOptional()
  @IsBoolean()
  useCredits?: boolean;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  promoCode?: string;
}

export class PromotionQuoteDto {
  @ApiProperty({ type: 'integer' })
  days!: number;

  @ApiProperty({ type: 'integer' })
  priceCentsPerDay!: number;

  @ApiProperty({ type: 'integer', description: 'days × price per day.' })
  grossCents!: number;

  @ApiProperty({ type: 'integer', description: 'If credits are used.' })
  totalCents!: number;

  @ApiProperty({ type: 'integer' })
  creditDaysAvailable!: number;

  @ApiProperty({ type: 'integer' })
  creditDaysUsed!: number;

  @ApiProperty({ type: 'integer' })
  maxDays!: number;

  @ApiProperty()
  enabled!: boolean;
}

export class CasePromotionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty({ enum: PROMOTION_STATUSES, enumName: 'CasePromotionStatus' })
  status!: PromotionStatus;

  @ApiProperty({ type: 'integer' })
  days!: number;

  @ApiProperty({ type: 'integer' })
  priceCentsPerDay!: number;

  @ApiProperty({ type: 'integer', description: 'Charged amount.' })
  totalCents!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  startsAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  endsAt!: string | null;

  @ApiProperty({ type: 'integer' })
  impressions!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class CasePromotionStateDto {
  @ApiPropertyOptional({
    type: CasePromotionDto,
    nullable: true,
    description: 'Active / pending one, else the latest.',
  })
  promotion!: CasePromotionDto | null;

  @ApiProperty({ description: 'The case can be promoted now.' })
  canPromote!: boolean;

  @ApiProperty({ type: PromotionQuoteDto, description: 'Quote for 1 day.' })
  quote!: PromotionQuoteDto;
}

export class CreatePromotionResultDto {
  @ApiProperty({ format: 'uuid' })
  promotionId!: string;

  @ApiProperty({ enum: PROMOTION_STATUSES, enumName: 'CasePromotionStatus' })
  status!: PromotionStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Open in the browser to pay; null when nothing to pay.',
  })
  checkoutUrl!: string | null;

  @ApiProperty({ type: 'integer' })
  totalCents!: number;

  @ApiProperty({ type: 'integer' })
  creditDaysUsed!: number;

  @ApiProperty({ type: CasePromotionDto })
  promotion!: CasePromotionDto;
}

// ---- admin ------------------------------------------------------------

export class AdminPromotionIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminPromotionsQueryDto {
  @ApiPropertyOptional({
    enum: PROMOTION_STATUSES,
    enumName: 'CasePromotionStatus',
  })
  @IsOptional()
  @IsIn(PROMOTION_STATUSES)
  status?: PromotionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdminPromotionRowDto extends CasePromotionDto {
  @ApiProperty()
  caseTitle!: string;

  @ApiProperty()
  caseStatus!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  ownerName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ownerEmail!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  paymentId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  promoCodeId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  grantedBy!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  cancelReason!: string | null;
}

export class AdminPromotionActionResultDto {
  @ApiProperty({ type: AdminPromotionRowDto })
  promotion!: AdminPromotionRowDto;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'E.g. "refund from the Payments screen" for a paid one.',
  })
  note!: string | null;
}

export class PromotionStatusCountDto {
  @ApiProperty()
  status!: string;

  @ApiProperty({ type: 'integer' })
  count!: number;
}

export class AdminPromotionStatsDto {
  @ApiProperty({ type: 'integer' })
  activeCount!: number;

  @ApiProperty({ type: 'integer' })
  revenue30dCents!: number;

  @ApiProperty({ type: 'integer' })
  paid30dCount!: number;

  @ApiProperty({ type: [PromotionStatusCountDto] })
  byStatus!: PromotionStatusCountDto[];
}

export class AdminGrantPromotionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  caseId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class AdminExtendPromotionDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class AdminCancelPromotionDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class PromotionSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: 'integer', minimum: 50, maximum: 1_000_000 })
  @IsInt()
  @Min(50)
  @Max(1_000_000)
  priceCentsPerDay!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  maxDays!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1, default: 1 })
  @IsInt()
  @Min(1)
  @Max(1)
  maxActivePerCase!: number;
}
