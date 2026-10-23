import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';

export interface RelyingParty {
  /** The RP ID (a registrable domain): `lawbid.dev` serves the web app,
   * the admin panel on `admin.lawbid.dev` and both native apps. */
  rpId: string;
  rpName: string;
  /** Every origin an assertion may come from: the web app origins, the
   * admin origins, the native apps (`android:apk-key-hash:…`; iOS sends
   * `https://<rpId>`), plus localhost in development. */
  origins: string[];
}

/**
 * Owner 2026-10-22 (systems checklist §1, passkeys): RP ID and origins
 * come from config, never from the request. WEBAUTHN_RP_ID overrides the
 * host of APP_LINK_BASE_URL; WEBAUTHN_ORIGINS adds origins (comma-separated,
 * e.g. the Android `android:apk-key-hash:<base64url sha256>` of each
 * signing key). The web origins are the admin-editable `web.allowed_origins`
 * and ADMIN_ORIGINS. Outside production any localhost origin is accepted,
 * so the Flutter web build and the admin dev server can enrol passkeys on
 * `localhost` (the RP ID becomes `localhost` when nothing else is set).
 */
@Injectable()
export class WebAuthnConfig {
  constructor(
    private readonly config: ConfigService,
    private readonly settings: AppSettingsService,
  ) {}

  private get production(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  async relyingParty(): Promise<RelyingParty> {
    const base = this.config.get<string>('APP_LINK_BASE_URL');
    const explicit = this.config.get<string>('WEBAUTHN_RP_ID');
    const webOrigins = (await this.settings.stringList('web.allowed_origins'))
      .map(normalizeOrigin)
      .filter((o): o is string => o !== null);
    const adminOrigins = (this.config.get<string>('ADMIN_ORIGINS') ?? '')
      .split(',')
      .map(normalizeOrigin)
      .filter((o): o is string => o !== null);
    const extra = (this.config.get<string>('WEBAUTHN_ORIGINS') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    const baseOrigin = base ? normalizeOrigin(base) : null;
    const rpId =
      explicit ??
      (baseOrigin ? new URL(baseOrigin).hostname : null) ??
      'localhost';
    const origins = new Set<string>([
      ...(baseOrigin ? [baseOrigin] : []),
      ...webOrigins,
      ...adminOrigins,
      ...extra,
      // iOS native passkeys present the web origin of the RP.
      `https://${rpId}`,
    ]);
    if (!this.production) {
      for (const port of [3000, 3001, 5173, 8080, 8443, 37000]) {
        origins.add(`http://localhost:${port}`);
      }
      origins.add('http://localhost');
    }
    return {
      rpId,
      rpName: 'LawBid',
      origins: [...origins],
    };
  }

  /** In development the browser may run on any localhost port. */
  allowsOrigin(rp: RelyingParty, origin: string): boolean {
    if (rp.origins.includes(origin)) return true;
    return !this.production && /^https?:\/\/localhost(:\d+)?$/.test(origin);
  }
}

function normalizeOrigin(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin;
  } catch {
    return null;
  }
}
