import 'package:lawbid/core/l10n/app_language.dart';

/// One row of the language picker (see `widgets/language_picker_sheet.dart`).
///
/// [appLanguage] is non-null for a selectable language; `null` rows are
/// roadmap placeholders — shown, searchable, "coming soon" — so the
/// owner's "search + list, most popular first, add languages over time"
/// request (2026-09-22 voice follow-up) has somewhere to grow into.
///
/// Which rows are selectable is decided by `mergeLanguageCatalog`
/// (language_catalog_provider.dart) from the live/cached
/// `GET /i18n/languages` list: any language active on the server becomes
/// selectable without an app update (stage 1.6 acceptance). The
/// [appLanguage] values in [kLanguageCatalog] below are only the offline
/// first-launch default (compiled-in `en`/`ru`).
class LanguageCatalogEntry {
  const LanguageCatalogEntry({
    required this.code,
    required this.nativeName,
    required this.englishName,
    this.appLanguage,
  });

  /// ISO 639-1 code, shown as a trailing hint and used for search matching.
  final String code;
  final String nativeName;
  final String englishName;
  final AppLanguage? appLanguage;

  bool get isEnabled => appLanguage != null;
}

/// Ordered: the 2 working languages first, then roadmap languages by
/// relevance to a US legal-services marketplace (file 01 §1's target
/// market) — roughly the most common languages spoken at home in the US
/// per Census ACS data, not raw global speaker counts. Deliberately not
/// exhaustive — this curated order is the fallback/tiebreak
/// `languageCatalogProvider` keeps for these codes even once the backend
/// list is live; the backend can still ADD codes beyond this list (see
/// that provider's doc comment).
const List<LanguageCatalogEntry> kLanguageCatalog = [
  LanguageCatalogEntry(
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    appLanguage: AppLanguage.en,
  ),
  LanguageCatalogEntry(
    code: 'ru',
    nativeName: 'Русский',
    englishName: 'Russian',
    appLanguage: AppLanguage.ru,
  ),
  LanguageCatalogEntry(
    code: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
  ),
  LanguageCatalogEntry(code: 'zh', nativeName: '中文', englishName: 'Chinese'),
  LanguageCatalogEntry(
    code: 'tl',
    nativeName: 'Tagalog',
    englishName: 'Tagalog',
  ),
  LanguageCatalogEntry(
    code: 'vi',
    nativeName: 'Tiếng Việt',
    englishName: 'Vietnamese',
  ),
  LanguageCatalogEntry(
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
  ),
  LanguageCatalogEntry(
    code: 'fr',
    nativeName: 'Français',
    englishName: 'French',
  ),
  LanguageCatalogEntry(code: 'ko', nativeName: '한국어', englishName: 'Korean'),
  LanguageCatalogEntry(
    code: 'ht',
    nativeName: 'Kreyòl Ayisyen',
    englishName: 'Haitian Creole',
  ),
  LanguageCatalogEntry(
    code: 'de',
    nativeName: 'Deutsch',
    englishName: 'German',
  ),
  LanguageCatalogEntry(code: 'fa', nativeName: 'فارسی', englishName: 'Persian'),
  LanguageCatalogEntry(
    code: 'it',
    nativeName: 'Italiano',
    englishName: 'Italian',
  ),
  LanguageCatalogEntry(
    code: 'pt',
    nativeName: 'Português',
    englishName: 'Portuguese',
  ),
  LanguageCatalogEntry(code: 'pl', nativeName: 'Polski', englishName: 'Polish'),
  LanguageCatalogEntry(code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi'),
  LanguageCatalogEntry(
    code: 'uk',
    nativeName: 'Українська',
    englishName: 'Ukrainian',
  ),
  LanguageCatalogEntry(code: 'ja', nativeName: '日本語', englishName: 'Japanese'),
];

/// Owner 2026-10-19: every shipped language by its English name too, so
/// «Nepali» finds नेपाली and the row shows what it is (a language the
/// server adds later without a name here shows its own name twice).
const Map<String, String> kLanguageEnglishNames = {
  'af': 'Afrikaans',
  'am': 'Amharic',
  'ar': 'Arabic',
  'az': 'Azerbaijani',
  'be': 'Belarusian',
  'bg': 'Bulgarian',
  'bn': 'Bengali',
  'bs': 'Bosnian',
  'ca': 'Catalan',
  'cs': 'Czech',
  'cy': 'Welsh',
  'da': 'Danish',
  'de': 'German',
  'el': 'Greek',
  'en': 'English',
  'es': 'Spanish',
  'et': 'Estonian',
  'eu': 'Basque',
  'fa': 'Persian',
  'fi': 'Finnish',
  'fr': 'French',
  'ga': 'Irish',
  'gl': 'Galician',
  'gu': 'Gujarati',
  'ha': 'Hausa',
  'he': 'Hebrew',
  'hi': 'Hindi',
  'hr': 'Croatian',
  'ht': 'Haitian Creole',
  'hu': 'Hungarian',
  'hy': 'Armenian',
  'id': 'Indonesian',
  'ig': 'Igbo',
  'is': 'Icelandic',
  'it': 'Italian',
  'ja': 'Japanese',
  'ka': 'Georgian',
  'kk': 'Kazakh',
  'km': 'Khmer',
  'kn': 'Kannada',
  'ko': 'Korean',
  'ku': 'Kurdish',
  'ky': 'Kyrgyz',
  'lo': 'Lao',
  'lt': 'Lithuanian',
  'lv': 'Latvian',
  'mk': 'Macedonian',
  'ml': 'Malayalam',
  'mn': 'Mongolian',
  'mr': 'Marathi',
  'ms': 'Malay',
  'mt': 'Maltese',
  'my': 'Burmese',
  'nb': 'Norwegian',
  'ne': 'Nepali',
  'nl': 'Dutch',
  'pa': 'Punjabi',
  'pl': 'Polish',
  'ps': 'Pashto',
  'pt': 'Portuguese',
  'ro': 'Romanian',
  'ru': 'Russian',
  'si': 'Sinhala',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'so': 'Somali',
  'sq': 'Albanian',
  'sr': 'Serbian',
  'sv': 'Swedish',
  'sw': 'Swahili',
  'ta': 'Tamil',
  'te': 'Telugu',
  'tg': 'Tajik',
  'th': 'Thai',
  'tk': 'Turkmen',
  'tl': 'Tagalog',
  'tr': 'Turkish',
  'uk': 'Ukrainian',
  'ur': 'Urdu',
  'uz': 'Uzbek',
  'vi': 'Vietnamese',
  'yo': 'Yoruba',
  'zh': 'Chinese',
  'zh-tw': 'Chinese (Traditional)',
  'zu': 'Zulu',
};
