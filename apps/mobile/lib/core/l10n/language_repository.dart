import 'app_language.dart';

/// Reads/writes the user's language preference. See [LocalLanguageRepository]
/// doc comment for why this exists ahead of stage 1.6's real i18n layer.
abstract interface class LanguageRepository {
  Future<AppLanguage> read();

  Future<void> write(AppLanguage language);
}
