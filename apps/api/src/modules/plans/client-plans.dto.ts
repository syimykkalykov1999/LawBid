import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PlanEntitlementsDto, PublicPlanDto } from './plans.dto';

export class ClientPlanCheckoutRequestDto {
  @ApiPropertyOptional({
    description:
      "Plan code from GET /plans?audience=client (default: the audience's default plan).",
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/)
  planCode?: string;
}

export class ClientPlanCheckoutDto {
  @ApiProperty() url!: string;
  @ApiProperty() sessionId!: string;
  @ApiProperty({ type: 'integer' }) priceCents!: number;
  @ApiProperty({ type: 'integer' }) trialDays!: number;
}

export class ClientPlanCompleteDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  sessionId!: string;
}

export class ClientSubscriptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: [
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired',
    ],
  })
  status!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, nullable: true }) planCode!: string | null;
  @ApiProperty({ type: 'integer' }) priceCents!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  trialEndsAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodEnd!: string | null;
  @ApiProperty() cancelAtPeriodEnd!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  canceledAt!: string | null;
}

/** GET /client-plans/me — the client's plan screen in one call. */
export class ClientPlanMeDto {
  @ApiProperty({ type: ClientSubscriptionDto, nullable: true })
  subscription!: ClientSubscriptionDto | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: PublicPlanDto, nullable: true })
  plan!: PublicPlanDto | null;
  @ApiProperty({ type: PlanEntitlementsDto })
  entitlements!: PlanEntitlementsDto;
  @ApiProperty({ type: [PublicPlanDto] }) plans!: PublicPlanDto[];
  @ApiProperty({
    description: 'A first purchase of a plan with trial days gets them.',
  })
  trialEligible!: boolean;
}
