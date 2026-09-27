import 'dart:ui' show Locale;

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/i18n_api_client.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// In-memory `/i18n/*` backend: the language list + per-language bundles,
/// with an [offline] switch that makes every call fail like a dropped
/// connection. Records every request in [calls].
class FakeI18nApiClient extends I18nApiClient {
  FakeI18nApiClient({
    List<I18nLanguageDto>? languages,
    Map<String, Map<String, String>>? bundles,
  })  : languages = languages ?? [lang('en', 'English', 0), lang('ru', 'Русский', 1)],
        bundles = bundles ?? {},
        super(Dio());

  List<I18nLanguageDto> languages;
  Map<String, Map<String, String>> bundles;
  bool offline = false;
  final List<String> calls = [];

  static I18nLanguageDto lang(String code, String name, int sort, {bool active = true}) =>
      I18nLanguageDto(code: code, nameNative: name, isActive: active, isRtl: false, sort: sort);

  static const _offline = ApiException(
    code: ApiException.networkErrorCode,
    message: 'offline',
  );

  @override
  Future<List<I18nLanguageDto>> getLanguages() async {
    calls.add('languages');
    if (offline) throw _offline;
    return languages;
  }

  @override
  Future<I18nBundleResult> getBundle(String lang, {int? since}) async {
    calls.add('bundle:$lang:${since ?? '-'}');
    if (offline) throw _offline;
    final bundle = bundles[lang] ?? const {};
    // Version 1 for any non-empty bundle; a delta request at that version
    // returns nothing new.
    final version = bundle.isEmpty ? 0 : 1;
    return I18nBundleResult(
      lang: lang,
      version: version,
      translations: since != null && since >= version ? const {} : bundle,
    );
  }
}

/// Everything the l10n layer needs, with real SharedPreferences (mocked
/// store) and a real in-memory Drift database.
class L10nHarness {
  L10nHarness._(this.prefs, this.db, this.api);

  final SharedPreferences prefs;
  final L10nDatabase db;
  final FakeI18nApiClient api;

  /// [prefsValues] seeds SharedPreferences (e.g. `{'l10n.language': 'en'}`)
  /// — pass [keepPrefs] to reuse the store of a previous harness (a
  /// "cold start" on the same device).
  static Future<L10nHarness> create({
    Map<String, Object> prefsValues = const {},
    bool keepPrefs = false,
    FakeI18nApiClient? api,
    L10nDatabase? db,
  }) async {
    // Every harness deliberately gets its own in-memory database.
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    if (!keepPrefs) SharedPreferences.setMockInitialValues(prefsValues);
    final prefs = await SharedPreferences.getInstance();
    final database = db ?? L10nDatabase(NativeDatabase.memory());
    return L10nHarness._(prefs, database, api ?? FakeI18nApiClient());
  }

  List<Override> overrides({List<Locale> systemLocales = const [Locale('en', 'US')]}) => [
        sharedPreferencesProvider.overrideWithValue(prefs),
        l10nDatabaseProvider.overrideWithValue(db),
        i18nApiClientProvider.overrideWithValue(api),
        systemLocalesProvider.overrideWithValue(systemLocales),
      ];

  ProviderContainer container({
    List<Locale> systemLocales = const [Locale('en', 'US')],
    List<Override> extra = const [],
  }) {
    final container = ProviderContainer(
      overrides: [...overrides(systemLocales: systemLocales), ...extra],
    );
    addTearDown(container.dispose);
    return container;
  }
}

/// Lets queued microtasks/timers (listeners, Drift, SharedPreferences)
/// run to completion.
Future<void> settle() async {
  for (var i = 0; i < 30; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}
