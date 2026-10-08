import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceDiscountDto } from '../billing/price-discount.dto';
import { IsIn, IsOptional } from 'class-validator';
import {
  type Audience,
  type EntitlementKey,
  ENTITLEMENT_KEYS,
  type EntitlementType,
} from './entitlement-catalog';

export const AUDIENCES = ['attorney', 'client'] as const;

export class LocalizedTextDto {
  @ApiPropertyOptional() en?: string;
  @ApiPropertyOptional() ru?: string;
}

/** One catalog entry — the app and the admin render labels from it. */
export class EntitlementDefDto {
  @ApiProperty({ enum: ENTITLEMENT_KEYS, enumName: 'EntitlementKey' })
  key!: EntitlementKey;
  @ApiProperty({ enum: ['boolean', 'number', 'price'] })
  type!: EntitlementType;
  @ApiProperty({ enum: AUDIENCES, isArray: true })
  audiences!: Audience[];
  @ApiProperty() group!: string;
  @ApiProperty({ type: LocalizedTextDto }) label!: LocalizedTextDto;
  @ApiProperty({ type: LocalizedTextDto }) description!: LocalizedTextDto;
  @ApiPropertyOptional({ type: 'integer' }) min?: number;
  @ApiPropertyOptional({ type: 'integer' }) max?: number;
  @ApiPropertyOptional() zeroIsUnlimited?: boolean;
}

/** Entitlement values; a number is a limit (see the catalog), a price is
 * cents or null (= the global price). */
export class PlanEntitlementsDto {
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  included_seats?: number | boolean | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  max_seats?: number | boolean | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  extra_seat_price_cents?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  bids_any_state?: number | boolean | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  max_active_bids?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  priority_search?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  calls?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  video_calls?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  document_templates?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  chat_translate?: number | boolean | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  translations_per_day?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  video_posts?: number | boolean | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  posts_per_day?: number | boolean | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  videos_per_day?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  case_promotion?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  platform_payments?: number | boolean | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  trial_days?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  verified_badge?: number | boolean | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  priority_feed?: number | boolean | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  max_active_cases?: number | boolean | null;
}

/** A plan as the app shows it on the "choose a plan" screen. */
export class PublicPlanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: AUDIENCES }) audience!: Audience;
  @ApiProperty({ enum: ['paid', 'baseline'] }) kind!: string;
  @ApiProperty({ type: LocalizedTextDto }) name!: LocalizedTextDto;
  @ApiProperty({ type: LocalizedTextDto }) tagline!: LocalizedTextDto;
  @ApiProperty({ type: LocalizedTextDto }) description!: LocalizedTextDto;
  @ApiProperty({ enum: ['month', 'year'], nullable: true, type: String })
  interval!: 'month' | 'year' | null;
  @ApiProperty({ example: 'usd' }) currency!: string;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Price per interval; null for a baseline / no price yet.',
  })
  amountCents!: number | null;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Price of one extra assistant seat per month (attorney plans).',
  })
  extraSeatCents!: number | null;
  @ApiProperty({
    type: PriceDiscountDto,
    nullable: true,
    description: 'Owner 2026-10-07: the strikethrough old price, or null.',
  })
  discount!: PriceDiscountDto | null;
  @ApiProperty({ type: PlanEntitlementsDto })
  entitlements!: PlanEntitlementsDto;
  @ApiProperty({ type: [LocalizedTextDto] }) highlights!: LocalizedTextDto[];
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: 'integer' }) trialDays!: number;
}

export class PlansListDto {
  @ApiProperty({ enum: AUDIENCES }) audience!: Audience;
  @ApiProperty({ type: [PublicPlanDto] }) plans!: PublicPlanDto[];
  @ApiProperty({ type: PublicPlanDto, nullable: true })
  baseline!: PublicPlanDto | null;
  @ApiProperty({ type: [EntitlementDefDto] }) catalog!: EntitlementDefDto[];
}

export class PlansQueryDto {
  @ApiPropertyOptional({ enum: AUDIENCES })
  @IsOptional()
  @IsIn(AUDIENCES)
  audience?: Audience;
}

export class SeatSummaryDto {
  @ApiProperty({ type: 'integer' }) included!: number;
  @ApiProperty({ type: 'integer' }) extra!: number;
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) max!: number;
}

/** GET /me/entitlements — what the signed-in user has right now. */
export class MyEntitlementsDto {
  @ApiProperty({ enum: AUDIENCES }) audience!: Audience;
  @ApiProperty({ enum: ['baseline', 'plan', 'legacy', 'grant'] })
  source!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  planId!: string | null;
  @ApiProperty({ type: String, nullable: true }) planCode!: string | null;
  @ApiProperty({ type: LocalizedTextDto }) planName!: LocalizedTextDto;
  @ApiProperty({ type: [LocalizedTextDto] })
  planHighlights!: LocalizedTextDto[];
  @ApiProperty() isPaid!: boolean;
  @ApiProperty({ type: PlanEntitlementsDto }) values!: PlanEntitlementsDto;
  @ApiProperty({ type: SeatSummaryDto, nullable: true })
  seats!: SeatSummaryDto | null;
  @ApiProperty({ type: [EntitlementDefDto] }) catalog!: EntitlementDefDto[];
}
