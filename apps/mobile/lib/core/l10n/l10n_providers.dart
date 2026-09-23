import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../network/dio_client.dart';
import 'app_language.dart';
import 'i18n_api_client.dart';
import 'l10n_database.dart';
import 'l10n_repository.dart';
import 'l10n_translator.dart';
import 'language_providers.dart';
import 'static_translator.dart';
import 'translator.dart';

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
  (ref) => L10nRepository(ref.watch(l10nDatabaseProvider), ref.watch(i18nApiClientProvider)),
);

String _languageCode(AppLanguage language) => switch (language) {
  AppLanguage.ru => 'ru',
  AppLanguage.en => 'en',
};

Map<String, String> _seedFor(AppLanguage language) => switch (language) {
  AppLanguage.ru => const StaticTranslatorRu().seedEntries,
  AppLanguage.en => const StaticTranslatorEn().seedEntries,
};

/// Owns the in-memory translation map [translatorProvider] reads from —
/// the real, backend-driven half of docs/01_FOUNDATION_AUTH.md §9.4's boot
/// sequence: "читает кэш из drift → показывает UI → в фоне запрашивает
/// bundle?since= → обновляет".
///
/// Two entry points, called from outside this class (never from [build]
/// itself — see below):
///   - [bootstrap], from `main.dart` before `runApp`: LOCAL-ONLY, no
///     network. Loads (seeding on a brand-new install) the cache for
///     whatever language is currently selected, so first paint never shows
///     blank/missing strings.
///   - [refreshInBackground], from `main.dart` right after `runApp`:
///     best-effort network refresh for the current language. A failure
///     here is swallowed by [L10nRepository.refresh] — the UI keeps
///     showing whatever [bootstrap] already loaded.
///
/// [build] itself does no I/O — it only registers a [Ref.listen] on
/// [languageControllerProvider] so that switching languages later (e.g.
/// via `LanguagePickerSheet`) re-runs the same load-then-refresh sequence
/// for the newly-selected language. Using `ref.listen` rather than
/// `ref.watch` here is deliberate: `ref.watch` would re-run [build] (and
/// therefore re-kick a load) on every language change AND reset [state] to
/// `const {}` first, causing a visible flash back to raw keys/seed data
/// before the reload completes; `ref.listen` reacts to the same change
/// without discarding the current state first.
@Riverpod(keepAlive: true)
class L10nCacheController extends _$L10nCacheController {
  @override
  Map<String, String> build() {
    ref.listen<AsyncValue<AppLanguage>>(languageControllerProvider, (previous, next) {
      final language = next.value;
      if (language == null || language == previous?.value) return;
      unawaited(_loadAndRefresh(language));
    });
    return const {};
  }

  Future<void> bootstrap() async {
    await _loadOnly(await _currentLanguage());
  }

  Future<void> refreshInBackground() async {
    await _loadAndRefresh(await _currentLanguage());
  }

  Future<void> _loadOnly(AppLanguage language) async {
    final repo = ref.read(l10nRepositoryProvider);
    final code = _languageCode(language);
    await repo.seedIfEmpty(code, _seedFor(language));
    final cached = await repo.loadCached(code);
    if (_isStillCurrent(language)) state = cached;
  }

  Future<void> _loadAndRefresh(AppLanguage language) async {
    await _loadOnly(language);
    final repo = ref.read(l10nRepositoryProvider);
    final refreshed = await repo.refresh(_languageCode(language));
    if (refreshed != null && _isStillCurrent(language)) state = refreshed;
  }

  /// Resolves the selected language, awaiting `LanguageController.build()`
  /// if it hasn't finished yet (its own read from `SharedPreferences` is
  /// effectively instant but still asynchronous — see
  /// `local_language_repository.dart`) rather than racing `.value` while
  /// it's still `null`/loading. Never throws — falls back to
  /// [AppLanguage.en] (file 01 §1's default), matching
  /// `SessionController.bootstrap`'s "must never throw" contract for
  /// anything called from `main.dart` before the first frame.
  Future<AppLanguage> _currentLanguage() async {
    try {
      return await ref.read(languageControllerProvider.future);
    } catch (_) {
      return AppLanguage.en;
    }
  }

  bool _isStillCurrent(AppLanguage language) =>
      (ref.read(languageControllerProvider).value ?? AppLanguage.en) == language;
}

/// Watches [languageControllerProvider] and [L10nCacheController] and
/// returns the matching [Translator]. Layered fallback (cached bundle →
/// compiled seed → raw key) lives in [L10nTranslator] — see that file's
/// doc comment. Call sites (`ref.watch(translatorProvider).t('key')`) are
/// UNCHANGED from the stage-1.5 stopgap this replaces (see translator.dart
/// doc comment); only this provider's implementation changed.
final translatorProvider = Provider<Translator>((ref) {
  final language = ref.watch(languageControllerProvider).value ?? AppLanguage.en;
  final cache = ref.watch(l10nCacheControllerProvider);
  return L10nTranslator(language: language, cache: cache);
});
