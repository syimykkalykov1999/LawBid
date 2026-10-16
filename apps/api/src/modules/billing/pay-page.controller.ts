import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { PayPageService, type PayPageSession } from './pay-page.service';
import type { SubscriptionMeDto } from './billing.dto';

class PayTokenDto {
  @IsString()
  @Length(20, 4000)
  token!: string;
}

class PayConfirmDto extends PayTokenDto {
  @IsString()
  @Length(8, 200)
  setupIntentId!: string;

  @IsOptional()
  @IsBoolean()
  chargeNow?: boolean;
}

/**
 * The calls of our own card page (`/pay.html`). Public: the signed token in
 * the body is the credential. Not in the OpenAPI contract (not an app API).
 */
@ApiExcludeController()
@Controller('pay')
export class PayPageController {
  constructor(private readonly pay: PayPageService) {}

  @Public()
  @Post('session')
  @HttpCode(HttpStatus.OK)
  session(@Body() dto: PayTokenDto): Promise<PayPageSession> {
    return this.pay.session(dto.token);
  }

  @Public()
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() dto: PayConfirmDto): Promise<SubscriptionMeDto> {
    return this.pay.confirm(
      dto.token,
      dto.setupIntentId,
      dto.chargeNow === true,
    );
  }
}
