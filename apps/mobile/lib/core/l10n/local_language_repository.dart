import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/language_repository.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';

const _kLanguageKey = 'l10n.language';

/// Local [LanguageRepository] backed by [LocalKvStore] (SharedPreferences)
/// — same shape as `LocalThemeModeRepository`. Server sync of the choice
/// (`PATCH /users/me {uiLanguage}`) is layered on top by
/// `PreferencesSyncController` (core/theme/preferences_sync.dart), not
/// here, so this stays usable before sign-in.
class LocalLanguageRepository implements LanguageRepository {
  const LocalLanguageRepository(this._kv);

  final LocalKvStore _kv;

  @override
  Future<String?> readStoredCode() async {
    final raw = _kv.getString(_kLanguageKey);
    if (raw == null || !AppLanguage.isValidCode(raw)) return null;
    return AppLanguage.normalizeCode(raw);
  }

  @override
  Future<void> write(AppLanguage language) =>
      _kv.setString(_kLanguageKey, language.code);
}
