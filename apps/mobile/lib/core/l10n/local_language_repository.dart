import '../persistence/local_kv_store.dart';
import 'app_language.dart';
import 'language_repository.dart';

const _kLanguageKey = 'l10n.language';

/// Local-only [LanguageRepository] backed by [LocalKvStore] (SharedPreferences)
/// — same shape as [LocalThemeModeRepository]. Owner request, 2026-09-22: a
/// working RU/EN toggle on the welcome screen now, ahead of stage 1.6's real
/// backend-driven i18n system (file 01 §15).
class LocalLanguageRepository implements LanguageRepository {
  const LocalLanguageRepository(this._kv);

  final LocalKvStore _kv;

  @override
  Future<AppLanguage> read() async {
    final raw = _kv.getString(_kLanguageKey);
    return switch (raw) {
      'ru' => AppLanguage.ru,
      // file 01 §1: English is the default interface language.
      _ => AppLanguage.en,
    };
  }

  @override
  Future<void> write(AppLanguage language) {
    final raw = switch (language) {
      AppLanguage.ru => 'ru',
      AppLanguage.en => 'en',
    };
    return _kv.setString(_kLanguageKey, raw);
  }
}
