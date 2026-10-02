import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/available_languages.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'language_catalog_provider.g.dart';

/// The language picker's list (`LanguagePickerSheet`). Kicks a background
/// `GET /i18n/languages` refresh, then merges the server's active list
/// ([activeLanguagesControllerProvider] — live, or the cached copy when
/// offline) into the curated [kLanguageCatalog] via [mergeLanguageCatalog].
@riverpod
Future<List<LanguageCatalogEntry>> languageCatalog(Ref ref) async {
  await ref.read(activeLanguagesControllerProvider.notifier).refresh();
  return mergeLanguageCatalog(ref.watch(activeLanguagesControllerProvider));
}

/// Merge rules (docs/01_FOUNDATION_AUTH.md §9.3/§9.4 + stage 1.6
/// acceptance "новый язык, импортированный через xlsx, появляется в
/// приложении без пересборки"):
///   - a row is SELECTABLE iff its code is in [selectableLanguageCodes]:
///     the compiled-in languages while the server list is unknown, then
///     every active server language (+ `en`). A language that exists only
///     on the server (e.g. `es` after an xlsx import) therefore becomes
///     selectable without a client release; its strings come from
///     `GET /i18n/bundle/:lang`, with English fallback;
///   - curated rows keep their order/English name; the server's
///     `name_native` replaces the curated native name;
///   - curated rows the server doesn't have stay visible as "coming soon"
///     (the owner's "list grows over time" picker, unchanged UI);
///   - server languages missing from the curated list are appended in the
///     server's `sort` order.
List<LanguageCatalogEntry> mergeLanguageCatalog(List<ServerLanguage>? server) {
  final selectable = selectableLanguageCodes(server);
  final byCode = {
    for (final lang in server ?? const <ServerLanguage>[]) lang.code: lang,
  };
  AppLanguage? appLanguageFor(String code) =>
      selectable.contains(code) ? AppLanguage.fromCode(code) : null;

  final merged = <LanguageCatalogEntry>[];
  for (final entry in kLanguageCatalog) {
    final fromServer = byCode.remove(entry.code);
    merged.add(
      LanguageCatalogEntry(
        code: entry.code,
        nativeName: fromServer?.nameNative ?? entry.nativeName,
        englishName: entry.englishName,
        appLanguage: appLanguageFor(entry.code),
      ),
    );
  }

  final extra = byCode.values.toList()
    ..sort((a, b) => a.sort.compareTo(b.sort));
  for (final lang in extra) {
    merged.add(
      LanguageCatalogEntry(
        code: lang.code,
        nativeName: lang.nameNative,
        englishName: lang.nameNative,
        appLanguage: appLanguageFor(lang.code),
      ),
    );
  }
  return merged;
}
