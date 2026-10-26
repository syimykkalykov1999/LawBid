import 'package:shared_preferences/shared_preferences.dart';

/// Thin wrapper over [SharedPreferences]. Every local-storage need in the app
/// should go through a repository interface (like `ThemeModeRepository`) whose
/// implementation depends on this — never call `SharedPreferences` directly
/// from a screen or provider. This is the first local-persistence code in the
/// app; it sets the pattern later stages (feature flags, onboarding-seen
/// flags, etc.) are expected to follow (docs/CHANGELOG.md stage 1.5).
class LocalKvStore {
  const LocalKvStore(this._prefs);

  final SharedPreferences _prefs;

  String? getString(String key) => _prefs.getString(key);

  Future<void> setString(String key, String value) =>
      _prefs.setString(key, value);

  Future<void> remove(String key) => _prefs.remove(key);
}
