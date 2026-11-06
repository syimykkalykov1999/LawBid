import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/session/browser_session_hint.dart';
import 'package:lawbid/core/session/token_secure_store.dart';

/// An in-memory stand-in for the platform keychain.
class _MemoryStorage implements FlutterSecureStorage {
  final Map<String, String> data = {};
  bool failReads = false;

  @override
  Future<String?> read({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (failReads) throw StateError('keystore unavailable');
    return data[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (value == null) {
      data.remove(key);
    } else {
      data[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    data.remove(key);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('TokenSecureStore (S3-8)', () {
    test(
      'hardened storage: this-device Keychain class and encrypted prefs',
      () {
        expect(
          TokenSecureStore.hardenedStorage.iOptions.toMap()['accessibility'],
          'first_unlock_this_device',
        );
        expect(
          TokenSecureStore.hardenedStorage.aOptions.toMap(),
          containsPair('encryptedSharedPreferences', 'true'),
        );
        expect(
          TokenSecureStore.hardenedStorage.aOptions.toMap(),
          containsPair('resetOnError', 'true'),
        );
      },
    );

    test('moves a token written by the old version on first read', () async {
      final fresh = _MemoryStorage();
      final old = _MemoryStorage()..data['auth.refresh_token'] = 'r-old';
      final store = TokenSecureStore(fresh, old);

      expect(await store.readRefreshToken(), 'r-old');
      expect(fresh.data['auth.refresh_token'], 'r-old');
      expect(old.data, isEmpty);
      // The second read no longer needs the old storage.
      old.failReads = true;
      expect(await store.readRefreshToken(), 'r-old');
    });

    test('a failing old storage reads as no token', () async {
      final old = _MemoryStorage()..failReads = true;
      final store = TokenSecureStore(_MemoryStorage(), old);
      expect(await store.readRefreshToken(), isNull);
    });

    test('writes go to the hardened storage only', () async {
      final fresh = _MemoryStorage();
      final old = _MemoryStorage();
      final store = TokenSecureStore(fresh, old);
      await store.writeRefreshToken('r-new', isDemo: true);
      expect(fresh.data['auth.refresh_token'], 'r-new');
      expect(await store.readRefreshTokenIsDemo(), isTrue);
      expect(old.data, isEmpty);
      await store.clear();
      expect(fresh.data, isEmpty);
    });
  });

  // Owner 2026-11-04 (web audit): a new browser tab of a signed-in browser
  // signs in with the HttpOnly cookie instead of asking for the password.
  group('TokenSecureStore browser-session hint', () {
    test('signing in on the website sets the hint', () async {
      final hint = _FakeHint();
      final store = TokenSecureStore(_MemoryStorage(), null, hint);
      await store.writeRefreshToken('');
      expect(hint.isSet, isTrue);
    });

    test('a new tab (empty storage, hint set) reads the cookie marker',
        () async {
      final hint = _FakeHint()..set();
      final store = TokenSecureStore(_MemoryStorage(), null, hint);
      final stored = await store.readRefreshToken();
      expect(stored, TokenSecureStore.cookieMarker);
      expect(TokenSecureStore.wireValue(stored!), '');
    });

    test('no hint, no token: signed out, no refresh is tried', () async {
      final store = TokenSecureStore(_MemoryStorage(), null, _FakeHint());
      expect(await store.readRefreshToken(), isNull);
    });

    test('a real token (phone) or a demo token never sets the hint', () async {
      final hint = _FakeHint();
      final store = TokenSecureStore(_MemoryStorage(), null, hint);
      await store.writeRefreshToken('rt-phone');
      await store.writeRefreshToken('rt-demo', isDemo: true);
      await store.writeRefreshToken('', isDemo: true);
      expect(hint.isSet, isFalse);
    });

    test('sign-out and a rejected token clear the hint', () async {
      final hint = _FakeHint();
      final store = TokenSecureStore(_MemoryStorage(), null, hint);
      await store.writeRefreshToken('');
      await store.clear();
      expect(hint.isSet, isFalse);
      expect(await store.readRefreshToken(), isNull);
    });

    test('phones have no hint at all', () {
      const hint = NoBrowserSessionHint();
      hint.set();
      expect(hint.isSet, isFalse);
    });
  });
}

class _FakeHint implements BrowserSessionHint {
  @override
  bool isSet = false;

  @override
  void set() => isSet = true;

  @override
  void clear() => isSet = false;
}
