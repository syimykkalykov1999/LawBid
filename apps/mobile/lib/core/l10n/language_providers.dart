import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../persistence/persistence_providers.dart';
import 'app_language.dart';
import 'language_repository.dart';
import 'local_language_repository.dart';

part 'language_providers.g.dart';

/// Same local-repository-behind-an-interface shape as
/// `themeModeRepositoryProvider` — stage 1.6 swaps this override for a real
/// backend-synced implementation without touching call sites.
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
