import { Injectable } from '@nestjs/common';
import { SecretsService } from '../../../../common/secrets/secrets.service';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import Twilio from 'twilio';
import type { SmsProvider } from './sms-provider.interface';
import { otpSmsText } from './otp-sms-text';
import {
  CallTimeoutError,
  CircuitBreaker,
  withRetry,
  withTimeout,
} from '../../../../common/resilience/resilience';

/** A failure on Twilio's side or the network (worth a retry, counts toward
 * the breaker); a 4xx (bad number, blocked country) is the caller's. */
export function isTwilioServiceFault(error: unknown): boolean {
  if (error instanceof CallTimeoutError) return true;
  const status = (error as { status?: number } | null)?.status;
  return status === undefined || status >= 500 || status === 429;
}

/** One per process, shared by every provider rebuild (key changes). */
export const twilioBreaker = new CircuitBreaker('twilio', {
  threshold: 5,
  openMs: 60_000,
});

/** Owner 2026-10-15: a hung Twilio must not hang the sign-in. */
const SEND_TIMEOUT_MS = 8_000;

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
export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber?: string;
  messagingServiceSid?: string;
}

export class TwilioSmsProvider implements SmsProvider {
  private readonly client: Twilio.Twilio;
  private readonly sender: { messagingServiceSid: string } | { from: string };

  constructor(
    creds: TwilioCredentials,
    private readonly logger: PinoLogger,
    private readonly androidAppHash?: string,
  ) {
    this.client = Twilio(creds.accountSid, creds.authToken, {
      timeout: SEND_TIMEOUT_MS + 2_000,
    });
    if (creds.messagingServiceSid) {
      this.sender = { messagingServiceSid: creds.messagingServiceSid };
    } else if (creds.fromNumber) {
      this.sender = { from: creds.fromNumber };
    } else {
      throw new Error('Twilio needs a messaging service SID or a from number');
    }
  }

  async send(toE164: string, code: string): Promise<void> {
    // Time limit, one more try after a brief failure, and a one-minute
    // pause once Twilio keeps failing (the sign-in then answers fast).
    await twilioBreaker.run(
      () =>
        withRetry(
          () =>
            withTimeout('twilio', SEND_TIMEOUT_MS, () =>
              this.client.messages.create({
                to: toE164,
                ...this.sender,
                body: otpSmsText(code, this.androidAppHash || undefined),
              }),
            ),
          {
            attempts: 2,
            baseDelayMs: 400,
            retryable: isTwilioServiceFault,
          },
        ),
      isTwilioServiceFault,
    );
    this.logger.info({ toE164Suffix: toE164.slice(-4) }, 'Twilio SMS OTP sent');
  }
}

/**
 * Owner 2026-10-01: the Twilio keys can be changed in the admin
 * (Integrations) at any time. Each send reads the current keys and
 * rebuilds the Twilio client only when they changed. SMS_PROVIDER=mock
 * keeps the mock; in a deployed environment without keys a send fails
 * loudly instead of silently using the mock.
 */
@Injectable()
export class DynamicSmsProvider implements SmsProvider {
  private cached?: { fingerprint: string; provider: TwilioSmsProvider };

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    private readonly secrets: SecretsService,
    private readonly mock: SmsProvider,
  ) {
    this.logger.setContext(DynamicSmsProvider.name);
  }

  async send(toE164: string, code: string): Promise<void> {
    if (this.config.get<string>('SMS_PROVIDER') === 'mock') {
      return this.mock.send(toE164, code);
    }
    const c = await this.secrets.get('twilio');
    const f = c?.fields ?? {};
    const complete =
      !!f.accountSid &&
      !!f.authToken &&
      (!!f.fromNumber || !!f.messagingServiceSid);
    if (!c || !complete) {
      const env = this.config.get<string>('NODE_ENV') ?? 'development';
      if (env === 'staging' || env === 'production') {
        this.logger.error(
          { alert: 'sms_not_configured' },
          'Twilio keys missing',
        );
        throw new Error('SMS is not configured');
      }
      return this.mock.send(toE164, code);
    }
    if (this.cached?.fingerprint !== c.fingerprint) {
      // (the Android hash is part of the bundle fingerprint)
      this.cached = {
        fingerprint: c.fingerprint,
        provider: new TwilioSmsProvider(
          {
            accountSid: f.accountSid,
            authToken: f.authToken,
            fromNumber: f.fromNumber,
            messagingServiceSid: f.messagingServiceSid,
          },
          this.logger,
          f.androidAppHash ?? this.config.get<string>('SMS_ANDROID_APP_HASH'),
        ),
      };
    }
    return this.cached.provider.send(toE164, code);
  }
}
