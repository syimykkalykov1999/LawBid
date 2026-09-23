import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'app_language.dart';
import 'i18n_api_client.dart';
import 'l10n_providers.dart';
import 'language_catalog.dart';

part 'language_catalog_provider.g.dart';

AppLanguage? _appLanguageFor(String code) => switch (code) {
  'ru' => AppLanguage.ru,
  'en' => AppLanguage.en,
  _ => null,
};

/// Backend-driven language catalog for `LanguagePickerSheet` (owner
/// direction, 2026-09-22 voice follow-up: the picker should grow as
/// languages are added on the backend, not stay pinned to the hardcoded
/// list — see `language_catalog.dart`'s doc comment). Merges
/// `GET /i18n/languages` into [kLanguageCatalog]:
///   - a code the hardcoded catalog already has keeps its curated
///     ordering/[LanguageCatalogEntry.englishName]/[LanguageCatalogEntry.appLanguage],
///     only refreshing [LanguageCatalogEntry.nativeName] from the backend;
///   - a code the backend knows about that ISN'T in the hardcoded catalog
///     yet is appended (in the backend's own `sort` order) as a new,
///     unselectable-until-a-client-build-adds-real-strings row — this is
///     the "list grows without an app update" behavior. It's still
///     selectable if [_appLanguageFor] recognizes the code (i.e. once a
///     client build actually adds an [AppLanguage] case + compiled seed
///     for it).
///
/// On any failure (offline, backend error) falls back to [kLanguageCatalog]
/// unchanged — same "compiled-in fallback ahead of any network round-trip"
/// principle as [L10nTranslator]'s seed layer, applied to the picker's list
/// instead of individual strings.
@riverpod
Future<List<LanguageCatalogEntry>> languageCatalog(Ref ref) async {
  try {
    final client = ref.watch(i18nApiClientProvider);
    final languages = await client.getLanguages();
    return _merge(languages);
  } catch (_) {
    return kLanguageCatalog;
  }
}

List<LanguageCatalogEntry> _merge(List<I18nLanguageDto> backend) {
  final byCode = {for (final lang in backend) if (lang.isActive) lang.code: lang};
  final merged = <LanguageCatalogEntry>[];

  for (final entry in kLanguageCatalog) {
    final fromBackend = byCode.remove(entry.code);
    merged.add(
      fromBackend == null
          ? entry
          : LanguageCatalogEntry(
              code: entry.code,
              nativeName: fromBackend.nameNative,
              englishName: entry.englishName,
              appLanguage: entry.appLanguage,
            ),
    );
  }

  final extra = byCode.values.toList()..sort((a, b) => a.sort.compareTo(b.sort));
  for (final lang in extra) {
    merged.add(
      LanguageCatalogEntry(
        code: lang.code,
        nativeName: lang.nameNative,
        englishName: lang.nameNative,
        appLanguage: _appLanguageFor(lang.code),
      ),
    );
  }
  return merged;
}
