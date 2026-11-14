import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/session/legacy_secure_storage.dart';
import 'package:lawbid/core/session/token_secure_store.dart';

/// Row 149 (flutter_secure_storage 9 -> 11): an Android user who updates
/// stays signed in. The native side (LegacySecureStorage.kt) answers with
/// what version 9 kept in EncryptedSharedPreferences; the old values are
/// written through version 11, read back, and only then removed natively.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('test/legacy_secure_storage');
  const tokens = FlutterSecureStorage();
  const plain = FlutterSecureStorage();

  late List<MethodCall> calls;

  /// The old (version 9) values the native side still holds.
  void native(Map<String, String>? old, {bool fail = false}) {
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (fail) throw PlatformException(code: 'keystore');
      return switch (call.method) {
        'read' => old,
        'forget' => true,
        _ => null,
      };
    });
  }

  Future<void> run() => LegacySecureStorage.move(
        LegacySecureStorage.keys(tokens: tokens, plain: plain),
        channel: channel,
        android: true,
      );

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    LegacySecureStorage.reset();
  });

  test('old values move to the new storage, then the old ones go', () async {
    native({
      'auth.refresh_token': 'rt-old',
      'auth.session_hint': '{"sub":"u1"}',
      'magic_link_verifier': 'verifier',
    });
    await run();
    expect(await tokens.read(key: 'auth.refresh_token'), 'rt-old');
    expect(await tokens.read(key: 'auth.session_hint'), '{"sub":"u1"}');
    expect(await plain.read(key: 'magic_link_verifier'), 'verifier');
    expect(calls.map((c) => c.method), ['read', 'forget']);
    expect(
      calls.last.arguments,
      containsAll(<String>['auth.refresh_token', 'magic_link_verifier']),
    );
  });

  test('the user stays signed in: the store reads the moved token', () async {
    native({'auth.refresh_token': 'rt-old'});
    await run();
    const store = TokenSecureStore(tokens);
    expect(await store.readRefreshToken(), 'rt-old');
  });

  test('a value the new version already wrote is not overwritten', () async {
    FlutterSecureStorage.setMockInitialValues({'auth.refresh_token': 'rt-new'});
    native({'auth.refresh_token': 'rt-old'});
    await run();
    expect(await tokens.read(key: 'auth.refresh_token'), 'rt-new');
    expect(calls.map((c) => c.method), ['read', 'forget']);
  });

  test('nothing old: nothing written, nothing removed', () async {
    native({});
    await run();
    expect(await tokens.readAll(), isEmpty);
    expect(calls.map((c) => c.method), ['read']);
  });

  test('an unreadable old storage changes nothing and is tried again later',
      () async {
    native(null, fail: true);
    await run();
    expect(await tokens.readAll(), isEmpty);
    expect(calls.map((c) => c.method), ['read']);
  });

  test('iPhone and the website have nothing to move', () async {
    native({'auth.refresh_token': 'rt-old'});
    await LegacySecureStorage.move(
      LegacySecureStorage.keys(tokens: tokens, plain: plain),
      channel: channel,
      android: false,
    );
    expect(calls, isEmpty);
  });

  test('the move runs once per start', () async {
    native({'auth.refresh_token': 'rt-old'});
    await Future.wait([
      LegacySecureStorage.ensureMoved(
        tokens: tokens,
        plain: plain,
        channel: channel,
        android: true,
      ),
      LegacySecureStorage.ensureMoved(
        tokens: tokens,
        plain: plain,
        channel: channel,
        android: true,
      ),
    ]);
    expect(calls.where((c) => c.method == 'read'), hasLength(1));
  });
}
