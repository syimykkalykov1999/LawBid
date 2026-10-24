import type { ConfigService } from '@nestjs/config';
import type { SecretsService } from '../../common/secrets/secrets.service';
import {
  CloudflareSfuClient,
  type CloudflareSfuCreds,
} from './cloudflare-sfu.client';
import type { VideoCallProvider } from './video-call-provider';

/** A health answer is reused this long (design doc §5: cache 30 s). */
export const SFU_HEALTH_CACHE_MS = 30_000;
/** Errors of Cloudflare itself inside this window ... */
export const SFU_ERROR_WINDOW_MS = 60_000;
/** ... this many mark it unhealthy without another probe. */
export const SFU_ERROR_LIMIT = 5;

/**
 * Cloudflare Realtime SFU behind the same VideoCallProvider interface
 * (`calls.video_provider` = cloudflare). Keys: Admin -> Integrations ->
 * `cloudflare_sfu` (appId, appToken), else CLOUDFLARE_SFU_APP_ID /
 * CLOUDFLARE_SFU_APP_TOKEN. Health is per API instance (in memory): a
 * cached probe plus a count of recent outage errors reported by the broker.
 */
export class CloudflareSfuProvider implements VideoCallProvider {
  readonly name = 'cloudflare' as const;

  private probe: { at: number; ok: boolean } | null = null;
  private errors: number[] = [];

  constructor(
    private readonly secrets: Pick<SecretsService, 'get'> | undefined,
    private readonly config: Pick<ConfigService, 'get'> | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async creds(): Promise<CloudflareSfuCreds | null> {
    const f = (await this.secrets?.get('cloudflare_sfu'))?.fields ?? {};
    const appId = (
      f.appId ??
      this.config?.get<string>('CLOUDFLARE_SFU_APP_ID') ??
      ''
    ).trim();
    const appToken = (
      f.appToken ??
      this.config?.get<string>('CLOUDFLARE_SFU_APP_TOKEN') ??
      ''
    ).trim();
    return appId && appToken ? { appId, appToken } : null;
  }

  async isConfigured(): Promise<boolean> {
    return (await this.creds()) !== null;
  }

  async client(): Promise<CloudflareSfuClient | null> {
    const c = await this.creds();
    return c ? new CloudflareSfuClient(c, this.fetchImpl) : null;
  }

  /** The broker reports every failure that was Cloudflare's fault. */
  recordOutage(): void {
    const t = this.now();
    this.errors = this.errors.filter((x) => t - x < SFU_ERROR_WINDOW_MS);
    this.errors.push(t);
    // The next health question must probe again, not trust an old "ok".
    this.probe = null;
  }

  /** Cached for 30 s; also false while errors keep coming. Never throws. */
  async healthy(): Promise<boolean> {
    const t = this.now();
    this.errors = this.errors.filter((x) => t - x < SFU_ERROR_WINDOW_MS);
    if (this.errors.length >= SFU_ERROR_LIMIT) return false;
    if (this.probe && t - this.probe.at < SFU_HEALTH_CACHE_MS) {
      return this.probe.ok;
    }
    const client = await this.client();
    if (!client) return false;
    let ok = false;
    try {
      await client.newSession();
      ok = true;
    } catch {
      ok = false;
    }
    this.probe = { at: this.now(), ok };
    return ok;
  }
}
