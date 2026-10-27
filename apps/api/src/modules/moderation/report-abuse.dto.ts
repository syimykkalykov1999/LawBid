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

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const bool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

// ---- requests -------------------------------------------------------------

export class AppealMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;
}

export class IdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class UserIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

export class NoteDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note!: string;
}

export class RestrictReporterDto extends NoteDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 180 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days!: number;
}

export class DecisionDto extends NoteDto {
  @ApiProperty({ description: 'true = approve the appeal, false = keep.' })
  @IsBoolean()
  accept!: boolean;
}

export class ReportersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  onlyRestricted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  appeals?: boolean;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class StrikesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AutoActionsQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'accepted', 'rejected', 'review'],
    default: 'pending',
  })
  @IsOptional()
  @IsIn(['pending', 'accepted', 'rejected', 'review'])
  status?: 'pending' | 'accepted' | 'rejected' | 'review';

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MetricsQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

// ---- responses ------------------------------------------------------------

export class ReporterHistoryEntryDto {
  @ApiProperty({ format: 'date-time' }) at!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() reason!: string;
}

export class ReporterRowDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ format: 'date-time' }) accountCreatedAt!: string;
  @ApiProperty() verifiedAttorney!: boolean;
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) upheld!: number;
  @ApiProperty({ type: 'integer' }) rejected!: number;
  @ApiProperty({ type: 'integer' }) pending!: number;
  @ApiProperty({ type: 'integer' }) warnings!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  suspendedUntil!: string | null;
  @ApiProperty({ type: 'integer' }) suspensions!: number;
  @ApiProperty({ type: String, nullable: true }) appealStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) appealMessage!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastReason!: string | null;
  @ApiProperty({ type: [ReporterHistoryEntryDto] })
  history!: ReporterHistoryEntryDto[];
}

export class StrikeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: 'integer' }) points!: number;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) targetType!: string | null;
  @ApiProperty({ type: String, nullable: true }) targetId!: string | null;
  @ApiProperty({ type: String, nullable: true }) actionId!: string | null;
  @ApiProperty({ type: String, nullable: true }) restriction!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  restrictionUntil!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) revokedNote!: string | null;
  @ApiProperty() active!: boolean;
}

export class StrikeLimitDto {
  @ApiProperty({ enum: ['none', 'cooldown', 'limited', 'suspended'] })
  level!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  until!: string | null;
}

export class StrikeStandingDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: 'integer' }) points!: number;
  @ApiProperty({ type: StrikeLimitDto }) limit!: StrikeLimitDto;
  @ApiProperty({ type: [StrikeDto] }) strikes!: StrikeDto[];
}

export class ReportingStatusDto {
  @ApiProperty({ type: 'integer' }) warnings!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  suspendedUntil!: string | null;
  @ApiProperty() canAppeal!: boolean;
  @ApiProperty({ type: String, nullable: true }) appealStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) appealNote!: string | null;
}

export class AutoActionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: [
      'content_hide',
      'account_limit',
      'account_suspend_temp',
      'account_suspend',
      'review_needed',
    ],
  })
  kind!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, nullable: true }) targetType!: string | null;
  @ApiProperty({ type: String, nullable: true }) targetId!: string | null;
  @ApiProperty({ type: 'number' }) score!: number;
  @ApiProperty({ type: 'number' }) threshold!: number;
  @ApiProperty() borderline!: boolean;
  @ApiProperty() enforced!: boolean;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reversedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() canAppeal!: boolean;
  @ApiProperty({ type: String, nullable: true }) appealStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) appealMessage!: string | null;
  @ApiProperty({ type: String, nullable: true }) appealNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  appealAt!: string | null;
  @ApiProperty() autoApproved!: boolean;
}

export class MyStandingDto {
  @ApiProperty({ type: StrikeStandingDto }) strikes!: StrikeStandingDto;
  @ApiProperty({ type: ReportingStatusDto }) reporting!: ReportingStatusDto;
  @ApiProperty({ type: [AutoActionDto] }) autoActions!: AutoActionDto[];
}

export class MetricsDayDto {
  @ApiProperty() day!: string;
  @ApiProperty({ type: 'integer' }) actions!: number;
  @ApiProperty({ type: 'integer' }) appeals!: number;
  @ApiProperty({ type: 'integer' }) overturned!: number;
}

export class DetectionMetricDto {
  @ApiProperty() mode!: string;
  @ApiProperty({ type: 'integer' }) count!: number;
  @ApiProperty({ type: 'integer' }) acted!: number;
}

export class AutoMetricsDto {
  @ApiProperty({ type: 'integer' }) days!: number;
  @ApiProperty({ type: [MetricsDayDto] }) perDay!: MetricsDayDto[];
  @ApiProperty({ type: 'integer' }) autoActions!: number;
  @ApiProperty({ type: 'integer' }) shadowActions!: number;
  @ApiProperty({ type: 'integer' }) appeals!: number;
  @ApiProperty({ type: 'integer' }) decidedAppeals!: number;
  @ApiProperty({ type: 'integer' }) overturned!: number;
  @ApiProperty({ type: 'integer' }) pendingAppeals!: number;
  @ApiProperty({ type: 'integer' }) overdueAppeals!: number;
  @ApiProperty({ type: 'integer' }) priorityReviews!: number;
  @ApiProperty({ type: 'number' }) appealRate!: number;
  @ApiProperty({ type: 'number' }) overturnRate!: number;
  @ApiProperty({ description: 'Overturn rate is above the alarm level.' })
  alarm!: boolean;
  @ApiProperty({ type: 'number' }) alarmPercent!: number;
  @ApiProperty({ type: [DetectionMetricDto] })
  detections!: DetectionMetricDto[];
}

export class StatusResultDto {
  @ApiProperty({ enum: ['accepted', 'rejected'] }) status!: string;
}
