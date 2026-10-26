import type { ConfigService } from '@nestjs/config';
import type { SecretsService } from '../../common/secrets/secrets.service';
import {
  CloudflareSfuClient,
  type CloudflareSfuClientOptions,
  type CloudflareSfuCreds,
} from './cloudflare-sfu.client';
import type { VideoCallProvider } from './video-call-provider';

/**
 * Cloudflare Realtime SFU behind the same VideoCallProvider interface.
 * Keys: Admin -> Integrations -> `cloudflare_sfu` (appId, appToken), else
 * CLOUDFLARE_SFU_APP_ID / CLOUDFLARE_SFU_APP_TOKEN. Whether NEW group calls
 * use it is decided by the shared breaker (cloudflare-transport.ts), not
 * here: owner 2026-10-26, no probing while Cloudflare is healthy.
 */
export class CloudflareSfuProvider implements VideoCallProvider {
  readonly name = 'cloudflare' as const;

  constructor(
    private readonly secrets: Pick<SecretsService, 'get'> | undefined,
    private readonly config: Pick<ConfigService, 'get'> | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Timeouts / backoff of the client (tests pass a no-op sleep). */
    private readonly clientOpts: CloudflareSfuClientOptions = {},
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
    return c
      ? new CloudflareSfuClient(c, this.fetchImpl, this.clientOpts)
      : null;
  }

  /** One real `sessions/new` with the CURRENT keys (a restored key counts at
   * once). Throws when Cloudflare does not open a session. Used by the
   * breaker probe (only while open) and the admin status board. */
  async probe(): Promise<void> {
    const client = await this.client();
    if (!client) throw new Error('Cloudflare SFU keys are not set');
    await client.newSession();
  }

  /** True when Cloudflare opens a session now. Never throws. */
  async healthy(): Promise<boolean> {
    try {
      await this.probe();
      return true;
    } catch {
      return false;
    }
  }
}
