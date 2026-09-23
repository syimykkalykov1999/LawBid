/**
 * docs/01_FOUNDATION_AUTH.md §9.3: importing a file with a new language
 * COLUMN (e.g. `es`) auto-registers that language (stage 1.6 acceptance
 * criterion — see I18nImportService). i18n_languages.name_native is
 * NOT NULL, so an auto-created row needs *some* native name at write
 * time; this is a starter map of common ISO 639-1 codes people are
 * actually likely to add next, not an attempt at a full ISO 639-1 table.
 * An admin can always fix name_native by re-importing a language that
 * already exists (import only ever creates the row once — see
 * I18nImportService) — this map only has to be good enough for the
 * label to make sense the moment the language first appears.
 *
 * Unknown code -> falls back to the uppercased code itself (e.g. an
 * import with column `xx` creates a language row with name_native "XX")
 * rather than failing the whole import over a missing display name.
 */
export const KNOWN_LANGUAGE_NATIVE_NAMES: Readonly<Record<string, string>> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  tr: 'Türkçe',
  uk: 'Українська',
  ar: 'العربية',
  he: 'עברית',
  hi: 'हिन्दी',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  fa: 'فارسی',
};

/** ISO 639-1 codes are exactly 2 lowercase Latin letters — the format §9.2
 * specifies ("остальные колонки код языка по ISO 639-1"). Import rejects
 * a header column that doesn't match this as an "unknown language"
 * (§9.3's explicit validation list), rather than silently accepting an
 * arbitrary string as a language code. */
export const ISO_639_1_PATTERN = /^[a-z]{2}$/;

export function nativeNameForLanguage(code: string): string {
  return KNOWN_LANGUAGE_NATIVE_NAMES[code] ?? code.toUpperCase();
}
