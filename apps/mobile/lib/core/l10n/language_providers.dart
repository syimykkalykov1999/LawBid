import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../persistence/persistence_providers.dart';
import 'app_language.dart';
import 'language_repository.dart';
import 'local_language_repository.dart';

part 'language_providers.g.dart';

/// Same local-repository-behind-an-interface shape as
/// `themeModeRepositoryProvider`.
///
/// UNCHANGED by stage 1.6 (docs/CHANGELOG.md) — deliberately: §9.3/§9.4
/// only specify a backend-driven TRANSLATION CONTENT sync
/// (`GET /i18n/languages` / `GET /i18n/bundle/:lang`, see
/// `l10n_providers.dart`'s `L10nCacheController`), not a backend-synced
/// LANGUAGE PREFERENCE — there's no `PATCH /users/me` (or similar) field
/// for it in this backend pass, and the spec doesn't ask for one. The
/// user's chosen [AppLanguage] stays a local-only `SharedPreferences`
/// value, same as before; only the STRINGS shown for that language are now
/// real and backend-driven.
final languageRepositoryProvider = Provider<LanguageRepository>(
  (ref) => LocalLanguageRepository(ref.watch(localKvStoreProvider)),
);

@riverpod
class LanguageController extends _$LanguageController {
  @override
  Future<AppLanguage> build() => ref.read(languageRepositoryProvider).read();

  Future<void> setLanguage(AppLanguage language) async {
    state = AsyncData(language);
    await ref.read(languageRepositoryProvider).write(language);
  }
}
