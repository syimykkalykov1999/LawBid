import 'package:lawbid/core/l10n/i18n_api_client.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';

/// Orchestrates [L10nDatabase] (local cache) and [I18nApiClient] (backend)
/// for the real L10n layer (docs/01_FOUNDATION_AUTH.md §9.4: "читает кэш из
/// drift → показывает UI → в фоне запрашивает bundle?since= → обновляет").
/// Plain class, no Riverpod dependency of its own — `L10nCacheController`
/// (l10n_providers.dart) is the Riverpod-facing half that calls this and
/// owns the in-memory `Map<String, String>` `Translator.t` reads from.
class L10nRepository {
  const L10nRepository(this._db, this._api);

  final L10nDatabase _db;
  final I18nApiClient _api;

  /// Fast, local-only read for app boot — never touches the network. See
  /// [L10nDatabase.loadLanguage].
  Future<Map<String, String>> loadCached(String lang) => _db.loadLanguage(lang);

  /// Seeds [lang] with the compiled-in [seed] map the FIRST time only (see
  /// [L10nDatabase.seedIfEmpty] — never overwrites a real synced bundle).
  Future<void> seedIfEmpty(String lang, Map<String, String> seed) =>
      _db.seedIfEmpty(lang, seed);

  /// Best-effort background refresh for [lang]: fetches the delta (or the
  /// full bundle, on a cache that's never been synced) from the backend
  /// and merges it into the local cache. ANY failure — offline, timeout,
  /// backend error, unknown language — is swallowed here and reported as
  /// `null`, never rethrown: docs/01_FOUNDATION_AUTH.md §9.1's "встроенный
  /// fallback... на случай отсутствия сети" means a failed refresh must
  /// leave the app exactly as usable as it was before the call, not crash
  /// or block on it.
  ///
  /// Returns the freshly-merged map (so the caller can update its
  /// in-memory copy without a second Drift read) when something actually
  /// changed, or `null` when the refresh didn't run, found nothing new, or
  /// failed — the caller's existing in-memory map stays authoritative in
  /// every `null` case.
  Future<Map<String, String>?> refresh(String lang) async {
    try {
      final cachedVersion = await _db.getVersion(lang);
      final result = await _api.getBundle(
        lang,
        since: cachedVersion > 0 ? cachedVersion : null,
      );
      if (result.translations.isEmpty && result.version == cachedVersion) {
        return null;
      }
      await _db.applyBundle(
        lang: lang,
        version: result.version,
        translations: result.translations,
      );
      return await _db.loadLanguage(lang);
    } catch (_) {
      return null;
    }
  }
}
