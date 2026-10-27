import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import twilio from 'twilio';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { SmsComplianceService } from './sms-compliance.service';
import { twiml } from './sms-compliance.logic';

/** The URL Twilio signed: the public address of this request. */
export function webhookUrlOf(req: {
  protocol: string;
  get(name: string): string | undefined;
  originalUrl: string;
}): string {
  return `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

/**
 * 2026-10-25 (TCPA): Twilio's "A message comes in" webhook for the sender
 * (Messaging Service or number): `POST /api/v1/webhooks/twilio/sms`.
 * STOP-like words (and Twilio's own `OptOutType`) land in our suppression
 * list and revoke the recorded consent; START lifts it; HELP gets our text
 * only when compliance.sms.reply_to_help is on (Twilio's Advanced Opt-Out
 * already answers STOP/HELP, so by default we answer with an empty TwiML).
 * The X-Twilio-Signature is checked with the account's auth token; a bad
 * or missing signature, or no keys, is a plain 404.
 */
@ApiTags('webhooks')
@Controller('webhooks/twilio')
export class TwilioInboundController {
  constructor(
    private readonly sms: SmsComplianceService,
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @SkipThrottle()
  @SkipVersionCheck()
  @Post('sms')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async inbound(
    @Req()
    req: {
      protocol: string;
      get(name: string): string | undefined;
      originalUrl: string;
    },
    @Body() body: Record<string, string>,
    @Headers('x-twilio-signature') signature: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const token =
      (await this.secrets.get('twilio'))?.fields?.authToken ??
      this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (
      !token ||
      !signature ||
      !body ||
      !twilio.validateRequest(token, signature, webhookUrlOf(req), body)
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }
    const result = await this.sms.handleInbound({
      from: body.From,
      body: body.Body,
      optOutType: body.OptOutType,
      messageSid: body.MessageSid ?? body.SmsMessageSid,
    });
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(twiml(result.reply ?? undefined));
  }
}
