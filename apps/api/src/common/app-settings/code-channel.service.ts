import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetAccountSendingEnabledCommand,
  GetSendQuotaCommand,
  SESClient,
} from '@aws-sdk/client-ses';
import { AppSettingsService } from './app-settings.service';
import { SecretsService } from '../secrets/secrets.service';

/**
 * Owner 25.11: «Мы не будем использовать SES … переключатель, по умолчанию
 * SMS». Admin setting `auth.code_channel` decides where a one-time
 * confirmation code of a signed-in person goes (step-up: case history,
 * data export, account deletion, contact change, setting a password):
 *  - `sms` (default): the account's verified phone;
 *  - `email`: the account's verified e-mail (once SES is connected);
 *  - `auto`: the e-mail only while SES is fully configured AND out of its
 *    sandbox (production access), else the phone.
 * A typo counts as `sms` (a code must arrive). The person's own contacts
 * then decide (see [codeTarget]): the chosen one if verified, else the
 * other verified one, else none.
 */
export type CodeChannelSetting = 'sms' | 'email' | 'auto';
export type CodeChannel = 'phone' | 'email';

export function parseCodeChannelSetting(raw: unknown): CodeChannelSetting {
  return raw === 'email' || raw === 'auto' ? raw : 'sms';
}

export interface CodeContacts {
  phone_e164: string | null;
  phone_verified_at: Date | null;
  email: string | null;
  email_verified_at: Date | null;
}

/** Pure: where a code goes for these contacts when [preferred] is the
 * chosen channel — the chosen one if verified, else the other verified
 * one; null when neither is verified. */
export function codeTarget(
  preferred: CodeChannel,
  c: CodeContacts | null | undefined,
): { channel: CodeChannel; identifier: string } | null {
  if (!c) return null;
  const phone =
    c.phone_verified_at && c.phone_e164
      ? { channel: 'phone' as const, identifier: c.phone_e164 }
      : null;
  const email =
    c.email_verified_at && c.email
      ? { channel: 'email' as const, identifier: c.email.toLowerCase() }
      : null;
  return preferred === 'email' ? (email ?? phone) : (phone ?? email);
}

/** SES in its sandbox: 200 messages a day and 1 a second
 * (docs.aws.amazon.com/ses/latest/dg/request-production-access.html);
 * production access raises the daily quota above it. */
export const SES_SANDBOX_DAILY_QUOTA = 200;
/** How long one SES reading is trusted (also after a failed read). */
export const SES_READY_TTL_MS = 5 * 60_000;

@Injectable()
export class CodeChannelService {
  private ready?: { at: number; value: Promise<boolean> };

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly secrets?: SecretsService,
  ) {}

  /** The admin's value (missing, unreadable or a typo → sms). */
  async setting(): Promise<CodeChannelSetting> {
    try {
      return parseCodeChannelSetting(
        await this.settings?.string('auth.code_channel'),
      );
    } catch {
      return 'sms';
    }
  }

  /** The channel the codes go by right now (auto resolved). */
  async preferred(): Promise<CodeChannel> {
    const mode = await this.setting();
    if (mode === 'email') return 'email';
    if (mode === 'auto') return (await this.sesReady()) ? 'email' : 'phone';
    return 'phone';
  }

  /** [codeTarget] for the channel chosen right now. */
  async targetFor(
    c: CodeContacts | null | undefined,
  ): Promise<{ channel: CodeChannel; identifier: string } | null> {
    return codeTarget(await this.preferred(), c);
  }

  /** `auto`: SES is the e-mail provider, has a region and a sender, sending
   * is enabled on the account and the daily quota is above the sandbox's.
   * Read at most every [SES_READY_TTL_MS]; any failure (no permission, no
   * network) = not ready, so the code goes by SMS. */
  sesReady(now: number = Date.now()): Promise<boolean> {
    if (this.ready && now - this.ready.at < SES_READY_TTL_MS) {
      return this.ready.value;
    }
    const value = this.readSes().catch(() => false);
    this.ready = { at: now, value };
    return value;
  }

  private async readSes(): Promise<boolean> {
    const provider = this.config.get<string>('EMAIL_PROVIDER');
    if (provider === 'mock' || provider === 'smtp') return false;
    const f = (await this.secrets?.get('ses'))?.fields ?? {};
    const region = f.region ?? this.config.get<string>('SES_REGION');
    const from = f.fromAddress ?? this.config.get<string>('SES_FROM_ADDRESS');
    if (!region || !from) return false;
    const client = this.client(region, f.accessKeyId, f.secretAccessKey);
    try {
      const [sending, quota] = await Promise.all([
        client.send(new GetAccountSendingEnabledCommand({})),
        client.send(new GetSendQuotaCommand({})),
      ]);
      return (
        sending.Enabled === true &&
        typeof quota.Max24HourSend === 'number' &&
        quota.Max24HourSend > SES_SANDBOX_DAILY_QUOTA
      );
    } finally {
      client.destroy();
    }
  }

  /** Seam for tests. */
  protected client(
    region: string,
    accessKeyId?: string,
    secretAccessKey?: string,
  ): Pick<SESClient, 'send' | 'destroy'> {
    return new SESClient({
      region,
      requestHandler: { requestTimeout: 3_000, connectionTimeout: 3_000 },
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }
}
