import 'app_language.dart';

/// Reads/writes the user's EXPLICIT language choice (the picker, or the
/// server's `uiLanguage` applied after login). "Nothing stored" is
/// meaningful: it means the language is auto-detected from the system
/// locale (docs/01_FOUNDATION_AUTH.md §9.4) — see `LanguageController`.
abstract interface class LanguageRepository {
  /// The stored ISO 639-1 code, or `null` when the user never chose one.
  Future<String?> readStoredCode();

  Future<void> write(AppLanguage language);
}
