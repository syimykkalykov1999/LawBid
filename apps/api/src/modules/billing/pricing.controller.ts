import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { PriceDiscountDto } from './price-discount.dto';
import { PricingService } from './pricing.service';

/** Owner 2026-10-03: today's prices, as set in the admin. */
export class PublicPricingDto {
  @ApiProperty({ example: 'usd' }) currency!: string;
  @ApiProperty({ type: 'integer' }) monthlyCents!: number;
  @ApiProperty({ type: 'integer' }) seatCents!: number;
  @ApiProperty({ type: 'integer' }) yearlyCents!: number;
  @ApiProperty({ type: 'integer' }) maxSeats!: number;
  @ApiProperty({ type: 'integer' }) trialDays!: number;
  @ApiProperty({ type: 'integer' }) clientBadgeCents!: number;
  /** Owner 2026-10-07: the strikethrough old price per plan, or null. */
  @ApiProperty({ type: PriceDiscountDto, nullable: true })
  monthlyDiscount!: PriceDiscountDto | null;
  @ApiProperty({ type: PriceDiscountDto, nullable: true })
  seatDiscount!: PriceDiscountDto | null;
  @ApiProperty({ type: PriceDiscountDto, nullable: true })
  yearlyDiscount!: PriceDiscountDto | null;
  @ApiProperty({ type: PriceDiscountDto, nullable: true })
  clientBadgeDiscount!: PriceDiscountDto | null;
}

/**
 * `GET /pricing` — public, so the website's pricing page and the app's
 * screens before sign-in show the admin's prices. Read-only, no user
 * data, so any origin may read it.
 */
@ApiTags('subscriptions')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @SkipVersionCheck()
  @Get()
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Current plan prices (set in the admin)' })
  @ApiEnvelopeResponse(PublicPricingDto)
  @ApiErrors({ 429: [ErrorCode.RATE_LIMITED] })
  async getPricing(): Promise<PublicPricingDto> {
    const a = await this.pricing.amounts();
    return {
      currency: this.pricing.currency(),
      monthlyCents: a.monthly,
      seatCents: a.seat,
      yearlyCents: a.yearly,
      maxSeats: await this.pricing.maxSeats(),
      trialDays: await this.pricing.defaultTrialDays(),
      clientBadgeCents: a.client_badge,
      monthlyDiscount: await this.pricing.discount('monthly'),
      seatDiscount: await this.pricing.discount('seat'),
      yearlyDiscount: await this.pricing.discount('yearly'),
      clientBadgeDiscount: await this.pricing.discount('client_badge'),
    };
  }
}
