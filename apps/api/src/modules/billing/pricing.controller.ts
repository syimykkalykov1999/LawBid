import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { MAX_ASSISTANT_SEATS, TRIAL_DAYS } from './billing.constants';
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
      maxSeats: MAX_ASSISTANT_SEATS,
      trialDays: TRIAL_DAYS,
      clientBadgeCents: a.client_badge,
    };
  }
}
