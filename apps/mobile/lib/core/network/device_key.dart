import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Owner 2026-10-05 (docs/CLIENT_FRAUD.md): a key of this phone that
/// survives reinstalling the app, sent as `X-Device-Key`. The server
/// keeps only a hash of it, to recognise a blocked fraudster opening a new
/// account on the same phone. Free platform ids, no third-party SDK:
///
/// - Android: `Settings.Secure.ANDROID_ID` (per app signing key and user;
///   changes only on a factory reset);
/// - iOS: a random id kept in the Keychain (Keychain items outlive the app;
///   `identifierForVendor` would change on reinstall).
///
/// Unlike `X-Device-Id` (sessions, rate limits) this one is never shown or
/// used for anything else. [load] runs before `runApp`; null when the
/// platform has none (tests, web, a failed lookup).
abstract final class DeviceKey {
  static String? _value;

  static String? get current => _value;

  static const _channel = MethodChannel('lawbid/device_key');
  static const _keychainKey = 'device.key.v1';

  /// Never throws.
  static Future<void> load() async {
    try {
      if (Platform.isAndroid) {
        final id = await _channel.invokeMethod<String>('androidId');
        if (id != null && id.trim().length >= 8) _value = 'a:${id.trim()}';
      } else if (Platform.isIOS) {
        const storage = FlutterSecureStorage(
          iOptions: IOSOptions(
            accessibility: KeychainAccessibility.first_unlock_this_device,
          ),
        );
        var id = await storage.read(key: _keychainKey);
        if (id == null || id.length < 16) {
          id = _randomId();
          await storage.write(key: _keychainKey, value: id);
        }
        _value = 'i:$id';
      }
    } on Object {
      _value = null;
    }
  }

  static String _randomId() {
    final random = Random.secure();
    return List<int>.generate(16, (_) => random.nextInt(256))
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
  }
}
