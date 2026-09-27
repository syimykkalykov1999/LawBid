import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import Twilio from 'twilio';
import type { SmsProvider } from './sms-provider.interface';

/**
 * Real provider, selected by config/provider-selection.ts when every
 * Twilio credential is present (SMS_PROVIDER=auto) or forced with
 * SMS_PROVIDER=twilio. Uses Twilio's Messages API, not Verify — see
 * sms-provider.interface.ts for why. Sender: TWILIO_MESSAGING_SERVICE_SID
 * (sender pool, the usual choice for US A2P 10DLC) when set, otherwise
 * TWILIO_FROM_NUMBER. Untested against a real Twilio account in this
 * environment (no credentials yet, docs/KEYS_SETUP.md) — its first live
 * call is still owed.
 */
@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly client: Twilio.Twilio;
  private readonly sender: { messagingServiceSid: string } | { from: string };

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TwilioSmsProvider.name);
    this.client = Twilio(
      this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );
    const messagingServiceSid = this.config.get<string>(
      'TWILIO_MESSAGING_SERVICE_SID',
    );
    this.sender = messagingServiceSid
      ? { messagingServiceSid }
      : { from: this.config.getOrThrow<string>('TWILIO_FROM_NUMBER') };
  }

  async send(toE164: string, code: string): Promise<void> {
    await this.client.messages.create({
      to: toE164,
      ...this.sender,
      body: `LawBid code: ${code}. Expires in 10 minutes.`,
    });
    this.logger.info({ toE164Suffix: toE164.slice(-4) }, 'Twilio SMS OTP sent');
  }
}
