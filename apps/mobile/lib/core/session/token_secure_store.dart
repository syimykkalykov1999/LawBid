import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kRefreshTokenKey = 'auth.refresh_token';
const _kRefreshTokenIsDemoKey = 'auth.refresh_token_demo';
const _kRealRefreshTokenKey = 'lawbid.realRefreshToken';

/// Thin wrapper over [FlutterSecureStorage], refresh-token only
/// (docs/01_FOUNDATION_AUTH.md §10.4: the refresh token is the one
/// long-lived, sensitive-enough credential that needs the OS
/// keychain/keystore rather than SharedPreferences — see `LocalKvStore`'s
/// doc comment for why everything else in the app uses that instead). The
/// access token never touches disk at all — it only ever lives in
/// `SessionController`'s in-memory state, reconstructed from the refresh
/// token on every cold start.
///
/// Owner 2026-10-05, demo mode (docs/ops/demo-world.md): next to the active
/// refresh token we keep (a) whether it belongs to a DEMO session — the
/// cold-start refresh must then carry `X-LawBid-Demo: 1` — and (b) the
/// REAL account's refresh token parked while a demo session is active
/// (`lawbid.realRefreshToken`), restored by `exitDemo()`.
class TokenSecureStore {
  const TokenSecureStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  Future<String?> readRefreshToken() => _storage.read(key: _kRefreshTokenKey);

  /// Whether the stored refresh token is a demo session's (false when none).
  Future<bool> readRefreshTokenIsDemo() async =>
      await _storage.read(key: _kRefreshTokenIsDemoKey) == '1';

  Future<void> writeRefreshToken(String token, {bool isDemo = false}) async {
    await _storage.write(key: _kRefreshTokenKey, value: token);
    if (isDemo) {
      await _storage.write(key: _kRefreshTokenIsDemoKey, value: '1');
    } else {
      await _storage.delete(key: _kRefreshTokenIsDemoKey);
    }
  }

  /// Clears the ACTIVE session's refresh token (and its demo flag). The
  /// parked real token, if any, is left alone — see [clearRealRefreshToken].
  Future<void> clear() async {
    await _storage.delete(key: _kRefreshTokenKey);
    await _storage.delete(key: _kRefreshTokenIsDemoKey);
  }

  Future<String?> readRealRefreshToken() =>
      _storage.read(key: _kRealRefreshTokenKey);

  Future<void> writeRealRefreshToken(String token) =>
      _storage.write(key: _kRealRefreshTokenKey, value: token);

  Future<void> clearRealRefreshToken() =>
      _storage.delete(key: _kRealRefreshTokenKey);
}
