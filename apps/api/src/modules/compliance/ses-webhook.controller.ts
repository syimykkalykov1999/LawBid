import {
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { SesWebhookService } from './ses-webhook.service';

/**
 * 2026-10-25: `POST /api/v1/webhooks/ses`, the HTTPS endpoint of the SNS
 * subscription that carries SES bounce and complaint events. SNS posts
 * JSON as `text/plain`, which app.setup.ts reads as a string. Anything that
 * is not a verified message from an allowed topic is a plain 404.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class SesWebhookController {
  constructor(private readonly ses: SesWebhookService) {}

  @Public()
  @SkipThrottle()
  @SkipVersionCheck()
  @Post('ses')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async receive(@Req() req: { body?: unknown }): Promise<{ received: true }> {
    const raw = typeof req.body === 'string' ? req.body : '';
    const outcome = raw ? await this.ses.receive(raw) : 'rejected';
    if (outcome === 'rejected') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }
    return { received: true };
  }
}
