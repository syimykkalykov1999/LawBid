import type { AppSettingsService } from './app-settings.service';
import type { AppSettingKey } from './app-settings.defaults';

/**
 * The owner's 3-state convention (Выкл / Вкл / Авто = off / on / auto).
 * `auto` is the default: the behaviour runs inside its ceiling setting.
 * The old boolean values stay accepted for one release: true = on,
 * false = off. Anything unreadable = auto (a typo never turns off a
 * safety net or starts a bill).
 */
export type SwitchMode = 'off' | 'on' | 'auto';

export function parseSwitchMode(raw: unknown): SwitchMode {
  if (raw === true) return 'on';
  if (raw === false) return 'off';
  if (raw === 'off' || raw === 'on' || raw === 'auto') return raw;
  return 'auto';
}

export async function readSwitchMode(
  settings: AppSettingsService,
  key: AppSettingKey,
): Promise<SwitchMode> {
  return parseSwitchMode(await settings.raw(key));
}
