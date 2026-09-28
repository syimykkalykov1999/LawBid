import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../modules/feature-flags/services/app-config.service';
import { APP_SETTINGS, type AppSettingKey } from './app-settings.defaults';

/**
 * Typed reads of product tunables from app_config (docs/03 §9, docs/04 §14). Values
 * come through AppConfigService, which caches the whole table in Redis
 * (30 s), so an admin change applies without a release and without a DB
 * hit per read. A missing or wrongly typed value falls back to the spec
 * default instead of breaking the request.
 */
@Injectable()
export class AppSettingsService {
  constructor(private readonly appConfig: AppConfigService) {}

  async number(key: AppSettingKey): Promise<number> {
    const fallback = APP_SETTINGS[key];
    const value = (await this.appConfig.getConfig())[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : (fallback as number);
  }

  async numberList(key: AppSettingKey): Promise<number[]> {
    const value = (await this.appConfig.getConfig())[key];
    return Array.isArray(value) && value.every((v) => typeof v === 'number')
      ? value
      : [...(APP_SETTINGS[key] as readonly number[])];
  }

  async stringList(key: AppSettingKey): Promise<string[]> {
    const value = (await this.appConfig.getConfig())[key];
    return Array.isArray(value) && value.every((v) => typeof v === 'string')
      ? value
      : [...(APP_SETTINGS[key] as readonly string[])];
  }
}
