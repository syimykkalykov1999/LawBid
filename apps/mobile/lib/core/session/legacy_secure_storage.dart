import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Row 149 (14.11): flutter_secure_storage 9 -> 11 without signing anyone
/// out. Version 9 kept the Android values in EncryptedSharedPreferences,
/// which version 11 cannot read. Before the first read, the old values are
/// taken from the phone's native side (MainActivity, LegacySecureStorage.kt),
/// written through version 11, read back, and only then removed there. A
/// failure at any step leaves the old values in place for the next start.
/// iOS keeps the same Keychain items across the versions, and the website
/// keeps its own storage (third_party/flutter_secure_storage_web), so there
/// is nothing to move on either.
abstract final class LegacySecureStorage {
  static const _channel = MethodChannel('lawbid/legacy_secure_storage');

  /// The keys that keep a person signed in, with the storage they now live
  /// in. (The email magic-link verifier is not moved: it lives minutes and
  /// only means «ask for a new code» when gone.)
  static Map<String, FlutterSecureStorage> keys({
    required FlutterSecureStorage tokens,
  }) =>
      {
        'auth.refresh_token': tokens,
        'auth.refresh_token_demo': tokens,
        'lawbid.realRefreshToken': tokens,
        'auth.session_hint': tokens,
      };

  static Future<void>? _done;

  /// Runs once per app start (later calls wait for the first).
  static Future<void> ensureMoved({
    required FlutterSecureStorage tokens,
    MethodChannel channel = _channel,
    bool? android,
  }) =>
      _done ??= move(
        keys(tokens: tokens),
        channel: channel,
        android: android,
      );

  /// Tests only: forget that the move ran.
  @visibleForTesting
  static void reset() => _done = null;

  /// Moves [targets] (key -> new storage). Never throws.
  @visibleForTesting
  static Future<void> move(
    Map<String, FlutterSecureStorage> targets, {
    MethodChannel channel = _channel,
    bool? android,
  }) async {
    if (!(android ??
        (!kIsWeb && defaultTargetPlatform == TargetPlatform.android))) {
      return;
    }
    final names = targets.keys.toList();
    Map<String, String>? old;
    try {
      old = await channel.invokeMapMethod<String, String>('read', names);
    } on Object {
      return; // No native side (a background engine) or unreadable: next time.
    }
    if (old == null || old.isEmpty) return;
    try {
      for (final MapEntry(:key, :value) in old.entries) {
        final store = targets[key];
        if (store == null) continue;
        // A value written by this version wins over the old one.
        final now = await store.read(key: key);
        if (now == null) await store.write(key: key, value: value);
        if (await store.read(key: key) == null) return;
      }
      await channel.invokeMethod<bool>('forget', names);
    } on Object {
      // The old values stay; the move runs again on the next start.
    }
  }
}
