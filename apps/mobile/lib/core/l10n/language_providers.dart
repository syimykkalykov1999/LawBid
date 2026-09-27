import 'dart:ui' show Locale, PlatformDispatcher;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../persistence/persistence_providers.dart';
import 'app_language.dart';
import 'available_languages.dart';
import 'language_repository.dart';
import 'local_language_repository.dart';

part 'language_providers.g.dart';

/// Same local-repository-behind-an-interface shape as
/// `themeModeRepositoryProvider`. The server copy of the choice
/// (`PATCH /users/me {uiLanguage}`, docs/01 §15 stage 1.7 acceptance
/// "язык и тема сохраняются") is handled by `PreferencesSyncController`
/// (core/theme/preferences_sync.dart).
final languageRepositoryProvider = Provider<LanguageRepository>(
  (ref) => LocalLanguageRepository(ref.watch(localKvStoreProvider)),
);

/// The device's preferred locales, most preferred first. A provider so
/// tests can pin it (docs/01 §9.4 "Автоопределение языка по системной
/// локали").
final systemLocalesProvider = Provider<List<Locale>>(
  (ref) => PlatformDispatcher.instance.locales,
);

/// docs/01_FOUNDATION_AUTH.md §9.4: "Автоопределение языка по системной
/// локали, если такой язык активен, иначе `en`". Walks the system locales
/// in preference order and returns the first one whose language is in
/// [selectable]; otherwise [AppLanguage.fallback].
AppLanguage detectSystemLanguage(List<Locale> systemLocales, Set<String> selectable) {
  for (final locale in systemLocales) {
    final code = AppLanguage.normalizeCode(locale.languageCode);
    if (selectable.contains(code)) return AppLanguage.fromCode(code);
  }
  return AppLanguage.fallback;
}

/// The current interface language.
///
/// Resolution (re-run whenever the server language list changes):
///   1. an explicit stored choice, if that language is still selectable
///      (or the server list was never fetched — then it's trusted as-is,
///      so a server-only language picked earlier survives an offline cold
///      start with an empty list cache);
///   2. otherwise the system locale, if that language is selectable
///      ([detectSystemLanguage]) — not persisted, so it keeps following
///      the device until the user picks one explicitly;
///   3. otherwise English.
///
/// keepAlive: the auto-detected value lives only here.
@Riverpod(keepAlive: true)
class LanguageController extends _$LanguageController {
  String? _stored;

  @override
  Future<AppLanguage> build() async {
    ref.listen<List<ServerLanguage>?>(activeLanguagesControllerProvider, (_, __) {
      final current = state.value;
      if (current == null) return;
      final next = _resolve();
      if (next != current) state = AsyncData(next);
    });
    _stored = await ref.read(languageRepositoryProvider).readStoredCode();
    return _resolve();
  }

  AppLanguage _resolve() {
    final server = ref.read(activeLanguagesControllerProvider);
    final selectable = selectableLanguageCodes(server);
    final stored = _stored;
    if (stored != null && (server == null || selectable.contains(stored))) {
      return AppLanguage.fromCode(stored);
    }
    return detectSystemLanguage(ref.read(systemLocalesProvider), selectable);
  }

  /// Explicit choice (picker, or the account's server value after login):
  /// applied immediately, persisted locally.
  Future<void> setLanguage(AppLanguage language) async {
    // Let a still-running [build] finish first — otherwise its late
    // `_stored = await readStoredCode()` would overwrite this choice.
    try {
      await future;
    } on Object {
      // A failed build doesn't block an explicit choice.
    }
    _stored = language.code;
    state = AsyncData(language);
    await ref.read(languageRepositoryProvider).write(language);
  }
}
