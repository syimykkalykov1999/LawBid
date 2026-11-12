import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../../../common/app-settings/app-settings.service';
import type { PAID_BAR_VENDOR_SETTINGS } from '../../../../common/app-settings/app-settings.defaults';
import { SecretsService } from '../../../../common/secrets/secrets.service';
import type { ResolvedRegistry } from './state-bar-adapter';

/**
 * Owner 2026-11-12 (row 54, docs/dev/BAR_SOURCES_2026-11-12.md): paid
 * services that license US professional-license data through an API. Each
 * is fully wired and OFF: its own switch (app setting, default false) and
 * its own key slot in Admin → Ключи и сервисы (provider registry, same id).
 * A paid service is asked only for a state that has no free source on
 * (no enabled row, no free default), and only when its switch is on AND
 * its key and request URL are saved. The request itself runs through the
 * existing `generic_rest` adapter (URL template, key, JSON paths), with the
 * per-state rate limit, 24 h cache and circuit breaker of every keyed API.
 */
export interface PaidBarVendor {
  /** provider-registry.ts id (the key slot). */
  id: string;
  label: string;
  /** App setting that switches it on (default false). */
  settingKey: keyof typeof PAID_BAR_VENDOR_SETTINGS;
  /** US states + DC it says it covers. */
  states: 'all' | readonly string[];
  priceText: string;
  signupUrl: string;
  termsUrl: string;
  checkedAt: string;
}

export const PAID_BAR_VENDORS: readonly PaidBarVendor[] = [
  {
    id: 'bar_vendor_microbilt',
    label: 'MicroBilt Professional License Search',
    settingKey: 'verification.bar_vendor_microbilt_enabled',
    states: 'all',
    priceText:
      'По договору (цены на сайте нет; ключи выдаёт MicroBilt Compliance)',
    signupUrl: 'https://developer.microbilt.com/getting-started',
    termsUrl:
      'https://www.microbilt.com/product/professional-license-verification',
    checkedAt: '2026-11-12',
  },
  {
    id: 'bar_vendor_surepass',
    label: 'Surepass US Professional License Verification',
    settingKey: 'verification.bar_vendor_surepass_enabled',
    states: 'all',
    priceText: 'По договору (цены на сайте нет; есть песочница)',
    signupUrl: 'https://surepass.io/global/get-api-key/',
    termsUrl: 'https://surepass.io/terms-of-service/',
    checkedAt: '2026-11-12',
  },
];

/** The generic_rest settings a paid service's key slot carries. */
export const VENDOR_CONFIG_FIELDS = [
  'urlTemplate',
  'authType',
  'authName',
  'method',
  'bodyType',
  'bodyTemplate',
  'headers',
  'recordPath',
  'numberPath',
  'statusPath',
  'activeValues',
  'firstNamePath',
  'middleNamePath',
  'lastNamePath',
  'fullNamePath',
  'admittedPath',
  'expiresPath',
  'profileUrl',
  'ratePerMin',
] as const;

export function vendorCovers(v: PaidBarVendor, stateCode: string): boolean {
  return v.states === 'all' || v.states.includes(stateCode);
}

/**
 * The first switched-on, configured paid service that covers a state, as a
 * generic_rest registry. Null when none (the state stays manual).
 */
@Injectable()
export class PaidBarVendorService {
  constructor(
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly secrets?: SecretsService,
  ) {}

  async resolve(stateCode: string): Promise<ResolvedRegistry | null> {
    if (!this.settings || !this.secrets) return null;
    for (const v of PAID_BAR_VENDORS) {
      if (!vendorCovers(v, stateCode)) continue;
      if (!(await this.on(this.settings, v))) continue;
      const creds = await this.secrets.get(v.id).catch(() => null);
      const f = creds?.fields ?? {};
      if (!f.apiKey || !f.urlTemplate) continue;
      const config: Record<string, string> = {};
      for (const name of VENDOR_CONFIG_FIELDS) {
        const value = f[name];
        if (value) config[name] = value;
      }
      if (!config.authType) config.authType = 'bearer';
      return {
        stateCode,
        adapter: 'generic_rest',
        config: { ...config, vendor: v.id },
        secret: f.apiKey,
      };
    }
    return null;
  }

  private async on(
    settings: AppSettingsService,
    v: PaidBarVendor,
  ): Promise<boolean> {
    try {
      return await settings.boolean(v.settingKey);
    } catch {
      return false;
    }
  }
}
