import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import {
  PayPageService,
  type PayPageResult,
  type PayPageSession,
} from './pay-page.service';

class PayTokenDto {
  @IsString()
  @Length(20, 4000)
  token!: string;
}

/** Owner 2026-10-22 (Stripe Tax): the billing address the page collected
 * (Stripe needs country + ZIP in the US; the IP is the fallback). */
class PayAddressDto {
  @IsString()
  @Length(2, 2)
  country!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  state?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  line1?: string;
}

class PaySessionDto extends PayTokenDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PayAddressDto)
  address?: PayAddressDto;
}

class PayConfirmDto extends PayTokenDto {
  /** subscription (required) and seats with a new card / wallet. */
  @IsOptional()
  @IsString()
  @Length(8, 200)
  setupIntentId?: string;

  @IsOptional()
  @IsBoolean()
  chargeNow?: boolean;

  /** seats: the proration moment the page showed the price for. */
  @IsOptional()
  @IsInt()
  @Min(0)
  prorationDate?: number;

  /** promotion: the PaymentIntent the page confirmed (informational; the
   * server reads the one on the promotion). */
  @IsOptional()
  @IsString()
  @Length(8, 200)
  paymentIntentId?: string;
}

/**
 * The calls of our own card page (`/pay.html`). Public: the signed token in
 * the body is the credential. Not in the OpenAPI contract (not an app API).
 * Owner 2026-10-22: subscription, assistant seats and Boost.
 */
@ApiExcludeController()
@Controller('pay')
export class PayPageController {
  constructor(private readonly pay: PayPageService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('session')
  @HttpCode(HttpStatus.OK)
  session(
    @Body() dto: PaySessionDto,
    @Ip() ip: string,
  ): Promise<PayPageSession> {
    return this.pay.session(dto.token, {
      ip: ip || null,
      address: dto.address ?? null,
    });
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() dto: PayConfirmDto): Promise<PayPageResult> {
    return this.pay.confirm(dto.token, {
      setupIntentId: dto.setupIntentId,
      chargeNow: dto.chargeNow === true,
      prorationDate: dto.prorationDate,
    });
  }
}
