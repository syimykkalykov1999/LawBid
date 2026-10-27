import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import Twilio from 'twilio';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { SecretsService } from '../../common/secrets/secrets.service';
import {
  DeletionStepsService,
  type StepOutcome,
} from './deletion-steps.service';

/** Messages deleted per run for one number (a person has a handful of OTPs). */
const TWILIO_MAX_MESSAGES = 1000;

/**
 * Vendors that keep something for their own fixed period and offer no
 * per-person delete we can call. Recorded as `retained` with the reason, so
 * the proof per vendor exists even where deletion is "wait for expiry".
 * Mirrored for the owner in docs/runbooks/VENDORS.md ("Deletion and
 * retention per vendor").
 */
export const VENDOR_RETENTION: Record<string, string> = {
  fcm: 'Push tokens are deleted here; Firebase drops a token itself after about 270 days without use. No per-person delete API.',
  livekit:
    'Nothing per person is stored at LiveKit; a room and its participant identities end with the call.',
  sentry:
    'Error events carry an opaque user id only; Sentry deletes events after the plan retention period (90 days by default).',
  ses: 'Only a bounce/complaint suppression entry (an address, no content) can remain at Amazon SES; it must stay so the address is not mailed again.',
  verification:
    'The vendor payload held by us is emptied; the verification vendor applies its own contractual retention.',
};

/**
 * Owner 2026-10-25 (privacy round 13, S13-11): deletion at third parties,
 * with a recorded result per vendor (`deletion_steps`). Stripe and Bunny are
 * handled in AccountAnonymizationService (their results are recorded
 * there). Here: Twilio — the one vendor with a per-resource delete API for
 * what we put into it (the one-time-code SMS log of the person's number) —
 * and the documented-retention rows for the rest.
 */
@Injectable()
export class VendorDeletionService {
  constructor(
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
    private readonly steps: DeletionStepsService,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(VendorDeletionService.name);
  }

  /** Twilio: deletes the message log entries sent TO the number. Twilio's
   * default log retention is 400 days; this removes them now. */
  async purgeTwilio(phoneE164: string | null): Promise<StepOutcome> {
    if (!phoneE164) return { status: 'skipped', detail: 'no phone number' };
    if (
      this.settings &&
      !(await this.settings.boolean('privacy.twilio_purge_enabled'))
    ) {
      return { status: 'skipped', detail: 'switched off in the admin' };
    }
    const cap = Math.min(
      TWILIO_MAX_MESSAGES,
      (await this.settings?.number('privacy.twilio_purge_max_messages')) ??
        TWILIO_MAX_MESSAGES,
    );
    if (this.config.get<string>('SMS_PROVIDER') === 'mock') {
      return { status: 'skipped', detail: 'SMS provider is the mock' };
    }
    const creds = await this.secrets.get('twilio');
    const sid = creds?.fields.accountSid;
    const token = creds?.fields.authToken;
    if (!sid || !token) {
      return { status: 'skipped', detail: 'Twilio is not configured' };
    }
    const client = Twilio(sid, token, { timeout: 15_000 });
    const messages = await client.messages.list({
      to: phoneE164,
      limit: cap,
    });
    let removed = 0;
    for (const m of messages) {
      await client.messages(m.sid).remove();
      removed += 1;
    }
    this.logger.info({ removed }, 'Twilio message log purged');
    return { status: 'ok', detail: `${removed} message log entries removed` };
  }

  /** The documented-retention rows (idempotent). */
  async recordRetained(userId: string): Promise<void> {
    for (const [vendor, why] of Object.entries(VENDOR_RETENTION)) {
      await this.steps.run(userId, vendor, () =>
        Promise.resolve({ status: 'retained', detail: why }),
      );
    }
  }
}
