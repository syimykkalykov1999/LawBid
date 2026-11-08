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

export const TRANSLATE_ZONES = [
  'chat',
  'posts',
  'cases',
  'reviews',
  'profiles',
] as const;
export type TranslateZone = (typeof TRANSLATE_ZONES)[number];

export const zoneKey = (zone: TranslateZone) => `translate.${zone}`;

/** The bootstrap flag the app reads for a zone. Owner 2026-11-08 (one
 * control): `chat_translate` in the bootstrap is the master itself (flag on
 * and the Google key saved), the same for every zone; each zone, chats
 * included, has its own `translate_<zone>` that follows the master. Before,
 * `chat_translate` doubled as the chat zone, so «only chosen zones» without
 * chats switched translation off in posts, cases, reviews and profiles too
 * (the app gates every zone on `chat_translate`). */
export const zoneFlag = (zone: TranslateZone) => `translate_${zone}`;

/** Is [zone] allowed by the scope settings (flag and key aside)? */
export function zoneAllowed(
  config: Record<string, unknown>,
  zone: TranslateZone,
): boolean {
  if (config[TRANSLATE_SCOPE_KEY] !== 'zones') return true;
  return config[zoneKey(zone)] !== false;
}
