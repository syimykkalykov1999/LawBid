import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kRefreshTokenKey = 'auth.refresh_token';

/// Thin wrapper over [FlutterSecureStorage], refresh-token only
/// (docs/01_FOUNDATION_AUTH.md §10.4: the refresh token is the one
/// long-lived, sensitive-enough credential that needs the OS
/// keychain/keystore rather than SharedPreferences — see `LocalKvStore`'s
/// doc comment for why everything else in the app uses that instead). The
/// access token never touches disk at all — it only ever lives in
/// `SessionController`'s in-memory state, reconstructed from the refresh
/// token on every cold start.
class TokenSecureStore {
  const TokenSecureStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  Future<String?> readRefreshToken() => _storage.read(key: _kRefreshTokenKey);

  Future<void> writeRefreshToken(String token) =>
      _storage.write(key: _kRefreshTokenKey, value: token);

  Future<void> clear() => _storage.delete(key: _kRefreshTokenKey);
}
