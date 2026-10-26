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
///
/// Owner 2026-10-22 (audit #7): on the website the server keeps the refresh
/// token in an HttpOnly cookie and answers `refreshToken: ''`. The store
/// then keeps [cookieMarker] instead of a token — "this tab is signed in,
/// the cookie holds the credential" — and [wireValue] turns it back into
/// the empty `refreshToken` the API reads as "use the cookie". A script on
/// the page can no longer read anything worth stealing.
///
/// Security pass 2026-10-25 (S3-8): the refresh token lives in the Keychain
/// class `first_unlock_this_device` (like `DeviceKey`), so an encrypted
/// backup restored on another phone does not clone a signed-in session, and
/// on Android in EncryptedSharedPreferences with `resetOnError`. A token a
/// previous version stored with the default options is moved on first read
/// ([_read]).
class TokenSecureStore {
  const TokenSecureStore([
    FlutterSecureStorage? storage,
    FlutterSecureStorage? legacy,
  ]) : _storage = storage ?? hardenedStorage,
       _legacy =
           legacy ?? (storage == null ? const FlutterSecureStorage() : null);

  /// The storage the tokens are kept in.
  static const hardenedStorage = FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      resetOnError: true,
    ),
  );

  /// Stored in place of a refresh token that lives in the web cookie.
  static const cookieMarker = 'cookie:';

  /// What a stored value sends as `refreshToken` to `/auth/refresh`.
  static String wireValue(String stored) =>
      stored == cookieMarker ? '' : stored;

  static String _stored(String token) => token.isEmpty ? cookieMarker : token;

  final FlutterSecureStorage _storage;

  /// The previous default-options storage, only to move old values (null in
  /// tests that inject their own storage).
  final FlutterSecureStorage? _legacy;

  /// Reads [key]; when it is not in the hardened storage but is in the old
  /// default one, moves it (delete the old item first, so the new
  /// accessibility class is applied to a fresh item) and returns it. Never
  /// throws for the legacy side: a failing old read is a missing value.
  Future<String?> _read(String key) async {
    final value = await _storage.read(key: key);
    final legacy = _legacy;
    if (value != null || legacy == null) return value;
    String? old;
    try {
      old = await legacy.read(key: key);
    } on Object {
      return null;
    }
    if (old == null) return null;
    try {
      await legacy.delete(key: key);
      await _storage.write(key: key, value: old);
    } on Object {
      // The caller still gets the value; the move is retried next time.
    }
    return old;
  }

  Future<String?> readRefreshToken() => _read(_kRefreshTokenKey);

  /// Whether the stored refresh token is a demo session's (false when none).
  Future<bool> readRefreshTokenIsDemo() async =>
      await _read(_kRefreshTokenIsDemoKey) == '1';

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

  Future<String?> readRealRefreshToken() => _read(_kRealRefreshTokenKey);

  Future<void> writeRealRefreshToken(String token) =>
      _storage.write(key: _kRealRefreshTokenKey, value: _stored(token));

  Future<void> clearRealRefreshToken() =>
      _storage.delete(key: _kRealRefreshTokenKey);
}
