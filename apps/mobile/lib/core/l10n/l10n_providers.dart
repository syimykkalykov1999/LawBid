import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/available_languages.dart';
import 'package:lawbid/core/l10n/i18n_api_client.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_repository.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'l10n_providers.g.dart';

/// Single [L10nDatabase] instance for the app's lifetime — same
/// keepAlive-via-plain-`Provider` shape as `tokenSecureStoreProvider`
/// (session_providers.dart). Opens (and, on first run, creates) the SQLite
/// file lazily on first read.
final l10nDatabaseProvider = Provider<L10nDatabase>((ref) => L10nDatabase());

/// `/i18n/*` HTTP client — see i18n_api_client.dart's doc comment.
final i18nApiClientProvider = Provider<I18nApiClient>(
  (ref) => I18nApiClient(ref.watch(dioProvider)),
);

final l10nRepositoryProvider = Provider<L10nRepository>(
  (ref) => L10nRepository(
    ref.watch(l10nDatabaseProvider),
    ref.watch(i18nApiClientProvider),
  ),
);

/// What [translatorProvider] renders from: the cached bundle of the
/// current language plus the cached English bundle (the §9.3 fallback
/// language). Both are plain in-memory maps loaded from Drift.
@immutable
class L10nCacheState {
  const L10nCacheState({
    this.lang,
    this.entries = const {},
    this.english = const {},
  });

  /// Code the [entries] belong to; `null` before the first load.
  final String? lang;
  final Map<String, String> entries;
  final Map<String, String> english;

  L10nCacheState copyWith({
    String? lang,
    Map<String, String>? entries,
    Map<String, String>? english,
  }) =>
      L10nCacheState(
        lang: lang ?? this.lang,
        entries: entries ?? this.entries,
        english: english ?? this.english,
      );
}

/// Owns the in-memory translation maps [translatorProvider] reads from —
/// docs/01_FOUNDATION_AUTH.md §9.4's boot sequence: "читает кэш из drift →
/// показывает UI → в фоне запрашивает bundle?since= → обновляет".
///
///   - [bootstrap], from `main.dart` before `runApp`: LOCAL-ONLY. Loads
///     intl date symbols and the Drift cache for the current language
///     (seeding the compiled-in maps on a brand-new install).
///   - [refreshInBackground], from the splash (`AppStartupController`):
///     refreshes the server language list (which may switch an
///     auto-detected language, see `LanguageController`), then the
///     current language's bundle (delta via `since=`) and, for any
///     non-English language, the English fallback bundle. Failures are
///     swallowed — the cached state stays.
///
/// [build] does no I/O; it `ref.listen`s to [languageControllerProvider]
/// so a later switch (picker, server value after login, auto-detection)
/// re-runs load-then-refresh for the new language without first resetting
/// the maps (no flash of raw keys).
@Riverpod(keepAlive: true)
class L10nCacheController extends _$L10nCacheController {
  @override
  L10nCacheState build() {
    ref.listen<AsyncValue<AppLanguage>>(languageControllerProvider,
        (previous, next) {
      final language = next.value;
      if (language == null || language == previous?.value) return;
      unawaited(_loadAndRefresh(language));
    });
    return const L10nCacheState();
  }

  Future<void> bootstrap() async {
    await initializeDateFormatting();
    await _loadOnly(await _currentLanguage());
  }

  Future<void> refreshInBackground() async {
    await ref.read(activeLanguagesControllerProvider.notifier).refresh();
    if (!ref.mounted) return;
    await _loadAndRefresh(await _currentLanguage());
  }

  Future<void> _loadOnly(AppLanguage language) async {
    if (!ref.mounted) return;
    final repo = ref.read(l10nRepositoryProvider);
    final code = language.code;
    final seed = compiledSeedFor(code);
    if (seed != null) await repo.seedIfEmpty(code, seed);
    final cached = await repo.loadCached(code);
    var english = const <String, String>{};
    if (language != AppLanguage.fallback) {
      final enCode = AppLanguage.fallback.code;
      await repo.seedIfEmpty(enCode, compiledSeedFor(enCode)!);
      english = await repo.loadCached(enCode);
    }
    if (_isStillCurrent(language)) {
      state = L10nCacheState(lang: code, entries: cached, english: english);
    }
  }

  Future<void> _loadAndRefresh(AppLanguage language) async {
    await _loadOnly(language);
    if (!_isStillCurrent(language)) return;
    final repo = ref.read(l10nRepositoryProvider);
    final results = await Future.wait([
      repo.refresh(language.code),
      if (language != AppLanguage.fallback)
        repo.refresh(AppLanguage.fallback.code),
    ]);
    if (!_isStillCurrent(language)) return;
    final refreshed = results[0];
    final english = results.length > 1 ? results[1] : null;
    if (refreshed == null && english == null) return;
    state = state.copyWith(
      lang: language.code,
      entries: refreshed,
      english: english,
    );
  }

  /// Resolves the selected language, awaiting `LanguageController.build()`
  /// if it hasn't finished yet. Never throws — falls back to
  /// [AppLanguage.fallback], matching `SessionController.bootstrap`'s
  /// "must never throw" contract for anything called before first frame.
  Future<AppLanguage> _currentLanguage() async {
    try {
      return await ref.read(languageControllerProvider.future);
    } on Object {
      return AppLanguage.fallback;
    }
  }

  /// `false` once this controller is disposed (container torn down while a
  /// load was in flight) — nothing may touch `ref`/`state` after that.
  bool _isStillCurrent(AppLanguage language) =>
      ref.mounted &&
      (ref.read(languageControllerProvider).value ?? AppLanguage.fallback) ==
          language;
}

/// The current [Translator]. Layered fallback (cached bundle → compiled
/// seed → English → raw key) lives in [L10nTranslator]. Call sites
/// (`ref.watch(translatorProvider).t('key')`) never change.
final translatorProvider = Provider<Translator>((ref) {
  final language =
      ref.watch(languageControllerProvider).value ?? AppLanguage.fallback;
  final cache = ref.watch(l10nCacheControllerProvider);
  // While a switch is loading, `cache.entries` still holds the PREVIOUS
  // language's bundle — never render those under the new language.
  final entries =
      cache.lang == language.code ? cache.entries : const <String, String>{};
  return L10nTranslator(
    language: language,
    cache: entries,
    englishCache: cache.english,
  );
});
