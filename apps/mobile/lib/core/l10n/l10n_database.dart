import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'l10n_database.g.dart';

/// One cached translation key/value pair for one language
/// (docs/01_FOUNDATION_AUTH.md §9.3's `i18n_translations` table, mirrored
/// client-side). Populated from `GET /i18n/bundle/:lang` responses (full or
/// delta) and, on a brand-new install, from the compiled-in seed maps in
/// static_translator.dart — see [L10nDatabase.seedIfEmpty]. Column named
/// `entryKey` rather than `key` to avoid any ambiguity with Drift/Dart's own
/// `key` vocabulary (Flutter widget keys, `MapEntry.key`, etc.) in generated
/// code and call sites.
class L10nTranslations extends Table {
  TextColumn get lang => text()();
  TextColumn get entryKey => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {lang, entryKey};
}

/// One row per language: the bundle `version` last successfully synced from
/// the backend (docs/01_FOUNDATION_AUTH.md §9.3) — sent back as `since=` on
/// the next background refresh so the server only has to return keys that
/// changed, not the whole bundle every time.
class L10nBundleMeta extends Table {
  TextColumn get lang => text()();
  IntColumn get version => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {lang};
}

/// Local SQLite cache backing the real, backend-driven L10n layer
/// (docs/01_FOUNDATION_AUTH.md §9.4: "читает кэш из drift"). Single
/// instance for the app's lifetime, held by `l10nDatabaseProvider`
/// (l10n_providers.dart) — same one-instance-for-app-lifetime shape as
/// other `core/` singletons like `TokenSecureStore`.
///
/// NOT YET GENERATED: this file's `part 'l10n_database.g.dart'` requires
/// `dart run build_runner build` (drift_dev), which this environment has no
/// dart/flutter binary to run — see docs/CHANGELOG.md's stage-1.6-flutter
/// entry. `*.g.dart` is gitignored repo-wide (apps/mobile/.gitignore:21),
/// same as `language_providers.g.dart` and every other generated file
/// already in this package, so that's expected, not an oversight.
@DriftDatabase(tables: [L10nTranslations, L10nBundleMeta])
class L10nDatabase extends _$L10nDatabase {
  /// [executor] is only ever passed explicitly by a test (e.g.
  /// `L10nDatabase(NativeDatabase.memory())`) — normal app code uses the
  /// zero-arg form, which opens the real on-disk cache via
  /// [_openConnection]. Plain positional forwarding to the generated
  /// `_$L10nDatabase(QueryExecutor)` superclass constructor, not a named
  /// `super.xxx` parameter, since the generated constructor's own
  /// parameter name isn't part of drift's public contract.
  L10nDatabase([QueryExecutor? executor])
      : super(executor ?? _openConnection());

  @override
  int get schemaVersion => 1;

  /// Every cached key/value for [lang], as a plain map for the O(1)
  /// synchronous lookups `Translator.t` needs — see
  /// `l10n_translator.dart`'s doc comment for why the map has to already be
  /// fully loaded into memory before any `t()` call, rather than queried
  /// per-key.
  Future<Map<String, String>> loadLanguage(String lang) async {
    final rows = await (select(l10nTranslations)
          ..where((row) => row.lang.equals(lang)))
        .get();
    return {for (final row in rows) row.entryKey: row.value};
  }

  Future<int> getVersion(String lang) async {
    final row = await (select(l10nBundleMeta)
          ..where((row) => row.lang.equals(lang)))
        .getSingleOrNull();
    return row?.version ?? 0;
  }

  /// Upserts [translations] into the cache for [lang] and records the new
  /// [version] in one transaction — used both for a full bundle (`since`
  /// omitted on the request) and a delta (`since` provided: only the keys
  /// that changed, per docs/01_FOUNDATION_AUTH.md §9.3's "полный или
  /// дельта-набор"). A delta never needs to delete rows: the server only
  /// ever sends keys that changed or are new, never tombstones for removed
  /// keys (not specced), so a stale-but-still-cached old key just sits
  /// unused until it's overwritten by a future full re-seed.
  Future<void> applyBundle({
    required String lang,
    required int version,
    required Map<String, String> translations,
  }) async {
    await batch((b) {
      for (final entry in translations.entries) {
        b.insert(
          l10nTranslations,
          L10nTranslationsCompanion.insert(
            lang: lang,
            entryKey: entry.key,
            value: entry.value,
          ),
          mode: InsertMode.insertOrReplace,
        );
      }
      b.insert(
        l10nBundleMeta,
        L10nBundleMetaCompanion.insert(lang: lang, version: Value(version)),
        mode: InsertMode.insertOrReplace,
      );
    });
  }

  /// Pre-populates the cache for [lang] with the compiled-in
  /// `StaticTranslatorRu`/`StaticTranslatorEn` map at version 0, but ONLY
  /// when [lang] has no cached bundle version yet (a fresh install/fresh
  /// Drift file) — never overwrites data a real `GET /i18n/bundle/:lang`
  /// response already wrote, so a stale compiled-in seed can never clobber
  /// a newer backend translation. See docs/01_FOUNDATION_AUTH.md §9.1: "В
  /// коде есть встроенный fallback (English) на случай отсутствия сети при
  /// первом запуске."
  Future<void> seedIfEmpty(String lang, Map<String, String> seed) async {
    final existingVersion = await getVersion(lang);
    if (existingVersion > 0) return;
    final hasRows = await (select(
      l10nTranslations,
    )..where((row) => row.lang.equals(lang)))
        .get();
    if (hasRows.isNotEmpty) return;
    await applyBundle(lang: lang, version: 0, translations: seed);
  }
}

QueryExecutor _openConnection() => driftDatabase(name: 'l10n_cache');
