import 'app_language.dart';

/// One row of the language picker (see `widgets/language_picker_sheet.dart`).
///
/// [appLanguage] is non-null only for languages [AppLanguage] actually
/// supports today (`ru`, `en`) — every other entry is a roadmap
/// placeholder: shown, searchable, but not selectable, so the owner's
/// "search + list, most popular first, add languages over time" request
/// (2026-09-22 voice follow-up) has somewhere to grow into.
///
/// UPDATE, stage 1.6 (docs/CHANGELOG.md): this constant is now the OFFLINE
/// FALLBACK for `languageCatalogProvider` (language_catalog_provider.dart),
/// which merges it with the live `GET /i18n/languages` list — a language
/// the backend adds now appears here without an app update, per the same
/// owner direction. [AppLanguage] itself still only has `ru`/`en` (each
/// with a real, backend-driven translation bundle); giving another
/// language a real [appLanguage] case + compiled seed is future work this
/// pass didn't do — see docs/CHANGELOG.md's stage-1.6-flutter entry for
/// why that was left out of scope.
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
  LanguageCatalogEntry(code: 'es', nativeName: 'Español', englishName: 'Spanish'),
  LanguageCatalogEntry(code: 'zh', nativeName: '中文', englishName: 'Chinese'),
  LanguageCatalogEntry(code: 'tl', nativeName: 'Tagalog', englishName: 'Tagalog'),
  LanguageCatalogEntry(code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese'),
  LanguageCatalogEntry(code: 'ar', nativeName: 'العربية', englishName: 'Arabic'),
  LanguageCatalogEntry(code: 'fr', nativeName: 'Français', englishName: 'French'),
  LanguageCatalogEntry(code: 'ko', nativeName: '한국어', englishName: 'Korean'),
  LanguageCatalogEntry(code: 'ht', nativeName: 'Kreyòl Ayisyen', englishName: 'Haitian Creole'),
  LanguageCatalogEntry(code: 'de', nativeName: 'Deutsch', englishName: 'German'),
  LanguageCatalogEntry(code: 'fa', nativeName: 'فارسی', englishName: 'Persian'),
  LanguageCatalogEntry(code: 'it', nativeName: 'Italiano', englishName: 'Italian'),
  LanguageCatalogEntry(code: 'pt', nativeName: 'Português', englishName: 'Portuguese'),
  LanguageCatalogEntry(code: 'pl', nativeName: 'Polski', englishName: 'Polish'),
  LanguageCatalogEntry(code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi'),
  LanguageCatalogEntry(code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian'),
  LanguageCatalogEntry(code: 'ja', nativeName: '日本語', englishName: 'Japanese'),
];
