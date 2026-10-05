/**
 * Owner 2026-10-05: where the paid translator (Google Translate) may be
 * used. The owner sets it in Ключи и сервисы → Google Translate:
 * - the master switch is the `chat_translate` flag (kept for its name:
 *   it predates the other zones) — off means no translation anywhere;
 * - `translate.scope` = 'all' (every zone) or 'zones' (only the zones
 *   whose `translate.<zone>` is not false).
 * Push notifications and the app's own texts are already in the reader's
 * language (UI localization), so they are not a zone.
 */
export const TRANSLATE_FLAG = 'chat_translate';
export const TRANSLATE_SCOPE_KEY = 'translate.scope';
export const TRANSLATE_SCOPES = ['all', 'zones'] as const;
export type TranslateScope = (typeof TRANSLATE_SCOPES)[number];

export const TRANSLATE_ZONES = [
  'chat',
  'posts',
  'cases',
  'reviews',
  'profiles',
] as const;
export type TranslateZone = (typeof TRANSLATE_ZONES)[number];

export const zoneKey = (zone: TranslateZone) => `translate.${zone}`;

/** The bootstrap flag the app reads for a zone (`chat_translate` stays
 * the chat one, as older app builds read it). */
export const zoneFlag = (zone: TranslateZone) =>
  zone === 'chat' ? 'chat_translate' : `translate_${zone}`;

/** Is [zone] allowed by the scope settings (flag and key aside)? */
export function zoneAllowed(
  config: Record<string, unknown>,
  zone: TranslateZone,
): boolean {
  if (config[TRANSLATE_SCOPE_KEY] !== 'zones') return true;
  return config[zoneKey(zone)] !== false;
}
