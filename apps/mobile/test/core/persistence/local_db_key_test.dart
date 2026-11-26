import 'dart:convert' show base64Decode;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/drift_recovery.dart';
import 'package:lawbid/core/persistence/local_db_key.dart';

/// S13 #26: the key of the encrypted local databases.
void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('32 random bytes, made once and kept in the secure storage', () async {
    final keys = LocalDatabaseKey(const FlutterSecureStorage());
    final first = await keys.passphrase();
    expect(base64Decode(first), hasLength(32));
    // Two databases opening at once share one key.
    expect(
      await Future.wait([keys.passphrase(), keys.passphrase()]),
      [first, first],
    );
    // The next start reads the same key.
    expect(
      await LocalDatabaseKey(const FlutterSecureStorage()).passphrase(),
      first,
    );
    expect(
      await const FlutterSecureStorage().read(key: LocalDatabaseKey.storageKey),
      first,
    );
  });

  test('another install gets another key', () async {
    final a = await LocalDatabaseKey(const FlutterSecureStorage()).passphrase();
    FlutterSecureStorage.setMockInitialValues({});
    final b = await LocalDatabaseKey(const FlutterSecureStorage()).passphrase();
    expect(a, isNot(b));
  });

  test('a locked keychain never makes a new key over the old one', () async {
    final storage = _LockedStorage();
    final keys = LocalDatabaseKey(storage);
    await expectLater(
      keys.passphrase(),
      throwsA(
        isA<LocalDatabaseKeyUnavailable>()
            .having((e) => e, 'keeps files', isA<DatabaseFilesKept>()),
      ),
    );
    expect(storage.writes, 0);
    // Not remembered: the next open asks again and gets the stored key.
    storage
      ..locked = false
      ..value = 'stored-key';
    expect(await keys.passphrase(), 'stored-key');
  });
}

class _LockedStorage extends Fake implements FlutterSecureStorage {
  bool locked = true;
  String? value;
  int writes = 0;

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (locked) throw StateError('errSecInteractionNotAllowed');
    return value;
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    writes++;
    this.value = value;
  }
}
