import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import Twilio from 'twilio';
import type { SmsProvider } from './sms-provider.interface';

/**
 * Real provider, gated behind SMS_PROVIDER=twilio (env.schema.ts requires
 * the three TWILIO_* vars when selected). Uses Twilio's Messages API, not
 * Verify — see sms-provider.interface.ts for why. Untested against a real
 * Twilio account in this environment (no credentials available in the
 * sandbox, docs/CHANGELOG.md) — implemented for real rather than stubbed
 * per the architecture review's recommendation, but its first live call
 * is still owed.
 */
@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly client: Twilio.Twilio;
  private readonly fromNumber: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TwilioSmsProvider.name);
    this.client = Twilio(
      this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );
    this.fromNumber = this.config.getOrThrow<string>('TWILIO_FROM_NUMBER');
  }

  async send(toE164: string, code: string): Promise<void> {
    await this.client.messages.create({
      to: toE164,
      from: this.fromNumber,
      body: `LawBid code: ${code}. Expires in 10 minutes.`,
    });
    this.logger.info({ toE164Suffix: toE164.slice(-4) }, 'Twilio SMS OTP sent');
  }
}
