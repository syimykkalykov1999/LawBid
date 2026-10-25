import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/session/token_secure_store.dart';

/// S15-2: the one-time rewrite of the keychain items under the
/// `first_unlock_this_device` class.
void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('on iOS the items are rewritten once and the marker is set', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    FlutterSecureStorage.setMockInitialValues({
      'auth.refresh_token': 'rt',
      'auth.refresh_token_demo': '1',
      'lawbid.realRefreshToken': 'real',
    });
    const store = TokenSecureStore();
    await store.migrateAccessibilityOnce();
    expect(await store.readRefreshToken(), 'rt');
    expect(await store.readRefreshTokenIsDemo(), isTrue);
    expect(await store.readRealRefreshToken(), 'real');
    expect(
      await const FlutterSecureStorage()
          .read(key: 'auth.keychain_accessibility_v2'),
      '1',
    );
    // A second run changes nothing.
    await store.migrateAccessibilityOnce();
    expect(await store.readRefreshToken(), 'rt');
  });

  test('a signed-out phone just gets the marker', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    FlutterSecureStorage.setMockInitialValues({});
    const store = TokenSecureStore();
    await store.migrateAccessibilityOnce();
    expect(await store.readRefreshToken(), isNull);
  });

  test('other platforms are not touched', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    FlutterSecureStorage.setMockInitialValues({'auth.refresh_token': 'rt'});
    const store = TokenSecureStore();
    await store.migrateAccessibilityOnce();
    expect(
      await const FlutterSecureStorage()
          .read(key: 'auth.keychain_accessibility_v2'),
      isNull,
    );
    expect(await store.readRefreshToken(), 'rt');
  });
}
