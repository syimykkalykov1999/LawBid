import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { WebhookSignatureError } from './payment-provider';
import { StripeWebhookIntakeService } from './stripe-webhook.intake';

/**
 * docs/06 §1.5 `POST /webhooks/stripe`: signature over the raw body,
 * the event stored in `stripe_webhook_events` (idempotent by id), an
 * immediate 200, processing in the BullMQ queue.
 */
@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly intake: StripeWebhookIntakeService) {}

  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async stripe(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true; queued: boolean }> {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    try {
      const queued = await this.intake.receive(raw, signature);
      return { received: true, queued };
    } catch (e) {
      if (e instanceof WebhookSignatureError) {
        throw new BadRequestException({
          code: ErrorCode.WEBHOOK_SIGNATURE_INVALID,
          message: e.message,
        });
      }
      throw e;
    }
  }
}
