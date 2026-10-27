import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { SecretEnvelope } from '../../common/secrets/secret-envelope';
import { SecretsService } from '../../common/secrets/secrets.service';
import type { CalendarProviderId, OAuthApp } from './calendar-providers';

const DEFAULT_API_BASE = 'https://api.lawbid.dev/api/v1';

/**
 * Owner 2026-10-28: where the calendar code finds its switches (admin
 * settings), the OAuth apps (Admin → Integrations, sealed in the database)
 * and the keys that seal refresh tokens / sign links.
 */
@Injectable()
export class CalendarConfig {
  private readonly envelope: SecretEnvelope | null;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: AppSettingsService,
    private readonly secrets: SecretsService,
  ) {
    const keys = config.get<string>('SECRETS_MASTER_KEYS');
    const kid = config.get<string>('SECRETS_ACTIVE_KID');
    this.envelope = keys && kid ? new SecretEnvelope(keys, kid) : null;
  }

  /** Public base of the API, no trailing slash (…/api/v1). */
  apiBase(): string {
    const v = this.config.get<string>('CALENDAR_API_BASE_URL');
    return (v && v.trim() ? v.trim() : DEFAULT_API_BASE).replace(/\/+$/, '');
  }

  /** Secret that signs "add to calendar" links (domain-separated). */
  signingSecret(): string | undefined {
    return this.config.get<string>('OTP_CODE_SECRET') || undefined;
  }

  redirectUri(provider: CalendarProviderId): string {
    return `${this.apiBase()}/calendar/oauth/${provider}/callback`;
  }

  get canSeal(): boolean {
    return this.envelope !== null;
  }

  seal(plain: string, aad: string): string {
    if (!this.envelope) throw new Error('SECRETS_MASTER_KEYS is not set');
    return this.envelope.encrypt(plain, aad);
  }

  open(sealed: string, aad: string): string {
    if (!this.envelope) throw new Error('SECRETS_MASTER_KEYS is not set');
    return this.envelope.decrypt(sealed, aad);
  }

  feedEnabled(): Promise<boolean> {
    return this.settings.boolean('calendar.feed_enabled');
  }

  async providerEnabled(provider: CalendarProviderId): Promise<boolean> {
    return this.settings.boolean(
      provider === 'google'
        ? 'calendar.google_enabled'
        : 'calendar.microsoft_enabled',
    );
  }

  /** The OAuth app the owner saved in the admin (or env), if complete. */
  async oauthApp(provider: CalendarProviderId): Promise<OAuthApp | null> {
    const id = provider === 'google' ? 'google_calendar' : 'microsoft_calendar';
    const c = await this.secrets.get(id);
    const clientId = c?.fields.clientId;
    const clientSecret = c?.fields.clientSecret;
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, tenant: c?.fields.tenant || undefined };
  }

  busyCacheMs(): Promise<number> {
    return this.settings
      .number('calendar.busy_cache_seconds')
      .then((s) => s * 1000);
  }

  busyTimeoutMs(): Promise<number> {
    return this.settings.number('calendar.busy_timeout_ms');
  }
}
