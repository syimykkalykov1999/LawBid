import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AnalyticsEventsDto } from './app-events.dto';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number;
}

export class AnalyticsStepDto {
  @ApiProperty({
    enum: [
      'signed_up',
      'verified',
      'role_chosen',
      'onboarded',
      'first_action',
      'paid',
    ],
  })
  key!: string;
  @ApiProperty()
  count!: number;
}

export class AnalyticsRetentionDto {
  @ApiProperty({ description: 'People who joined 7–14 days ago.' })
  cohort!: number;
  @ApiProperty({ description: 'Came back after day 1.' })
  d1Percent!: number;
  @ApiProperty({ description: 'Came back after day 7.' })
  d7Percent!: number;
}

export class AnalyticsChurnPartDto {
  @ApiProperty({ description: 'Active 30–60 days ago.' })
  before!: number;
  @ApiProperty({ description: 'Of them, not seen in the last 30 days.' })
  lost!: number;
}

export class AnalyticsChurnDto {
  @ApiProperty({ type: AnalyticsChurnPartDto })
  clients!: AnalyticsChurnPartDto;
  @ApiProperty({ type: AnalyticsChurnPartDto })
  attorneys!: AnalyticsChurnPartDto;
}

export class AnalyticsDayDto {
  @ApiProperty()
  day!: string;
  @ApiProperty({ description: 'People who opened the app.' })
  active!: number;
  @ApiProperty()
  signups!: number;
  @ApiProperty()
  subscriptionCents!: number;
  @ApiProperty()
  boostCents!: number;
  @ApiProperty({ description: 'Subscription payments and Boosts bought.' })
  purchases!: number;
}

export class AnalyticsDto {
  @ApiProperty()
  days!: number;
  @ApiProperty()
  dau!: number;
  @ApiProperty()
  wau!: number;
  @ApiProperty()
  mau!: number;
  @ApiProperty({ description: 'DAU as a share of MAU, in percent.' })
  stickinessPercent!: number;
  @ApiProperty({ type: AnalyticsStepDto, isArray: true })
  funnel!: AnalyticsStepDto[];
  @ApiProperty({ type: AnalyticsRetentionDto })
  retention!: AnalyticsRetentionDto;
  @ApiProperty({ type: AnalyticsChurnDto })
  churn!: AnalyticsChurnDto;
  @ApiProperty({ type: AnalyticsDayDto, isArray: true })
  daily!: AnalyticsDayDto[];
  @ApiProperty({ type: AnalyticsEventsDto })
  events!: AnalyticsEventsDto;
}
