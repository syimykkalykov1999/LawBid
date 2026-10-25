import 'package:flutter/foundation.dart'
    show TargetPlatform, debugPrint, defaultTargetPlatform, kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kRefreshTokenKey = 'auth.refresh_token';
const _kRefreshTokenIsDemoKey = 'auth.refresh_token_demo';
const _kRealRefreshTokenKey = 'lawbid.realRefreshToken';
const _kAccessibilityMigratedKey = 'auth.keychain_accessibility_v2';

/// S15-2: a push- or call-woken app on a LOCKED phone must still read its
/// refresh token. The plugin default (`unlocked`) refuses that; this
/// is readable after the first unlock since boot and never leaves the device.
const _kIosOptions = IOSOptions(
  accessibility: KeychainAccessibility.first_unlock_this_device,
);

/// S15-2: when the Android keystore cannot unwrap its key ("Failed to unwrap
/// key", after a restore or a lock-screen change) the plugin drops the
/// unreadable data and answers null instead of throwing forever: the user
/// signs in again instead of a blank splash.
const _kAndroidOptions = AndroidOptions(resetOnError: true);

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
///
/// Owner 2026-10-22 (audit #7): on the website the server keeps the refresh
/// token in an HttpOnly cookie and answers `refreshToken: ''`. The store
/// then keeps [cookieMarker] instead of a token — "this tab is signed in,
/// the cookie holds the credential" — and [wireValue] turns it back into
/// the empty `refreshToken` the API reads as "use the cookie". A script on
/// the page can no longer read anything worth stealing.
class TokenSecureStore {
  const TokenSecureStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: _kIosOptions,
              aOptions: _kAndroidOptions,
            );

  /// Stored in place of a refresh token that lives in the web cookie.
  static const cookieMarker = 'cookie:';

  /// What a stored value sends as `refreshToken` to `/auth/refresh`.
  static String wireValue(String stored) =>
      stored == cookieMarker ? '' : stored;

  static String _stored(String token) => token.isEmpty ? cookieMarker : token;

  final FlutterSecureStorage _storage;

  /// S15-2: one-time rewrite of the existing keychain items under the new
  /// accessibility class (delete + add: an update does not change it).
  /// iOS only; a failure (locked phone, keychain error) is retried on the
  /// next launch because the marker is written last. Never throws.
  Future<void> migrateAccessibilityOnce() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) return;
    try {
      if (await _storage.read(key: _kAccessibilityMigratedKey) == '1') return;
      for (final key in [
        _kRefreshTokenKey,
        _kRefreshTokenIsDemoKey,
        _kRealRefreshTokenKey,
      ]) {
        final value = await _storage.read(key: key);
        if (value == null) continue;
        await _storage.delete(key: key);
        await _rewrite(key, value);
      }
      await _storage.write(key: _kAccessibilityMigratedKey, value: '1');
    } on Object catch (e) {
      debugPrint('keychain accessibility migration deferred: $e');
    }
  }

  // The value was just deleted: it must not be lost to a transient error.
  Future<void> _rewrite(String key, String value) async {
    for (var attempt = 0;; attempt++) {
      try {
        await _storage.write(key: key, value: value);
        return;
      } on Object {
        if (attempt >= 2) rethrow;
        await Future<void>.delayed(const Duration(milliseconds: 200));
      }
    }
  }

  Future<String?> readRefreshToken() => _storage.read(key: _kRefreshTokenKey);

  /// Whether the stored refresh token is a demo session's (false when none).
  Future<bool> readRefreshTokenIsDemo() async =>
      await _storage.read(key: _kRefreshTokenIsDemoKey) == '1';

  Future<void> writeRefreshToken(String token, {bool isDemo = false}) async {
    await _storage.write(key: _kRefreshTokenKey, value: _stored(token));
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
      _storage.write(key: _kRealRefreshTokenKey, value: _stored(token));

  Future<void> clearRealRefreshToken() =>
      _storage.delete(key: _kRealRefreshTokenKey);
}
