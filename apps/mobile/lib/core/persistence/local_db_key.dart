import 'dart:convert' show base64Encode;
import 'dart:math' show Random;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lawbid/core/persistence/drift_recovery.dart';
import 'package:lawbid/core/session/token_secure_store.dart';

/// The key could not be read (or kept) right now: the Keychain is locked
/// before the first unlock after a reboot (a push or a call woke the app), or
/// the keystore failed. The database files are left exactly as they are; the
/// database works in memory for this process and the next start tries again.
class LocalDatabaseKeyUnavailable implements DatabaseFilesKept {
  const LocalDatabaseKeyUnavailable(this.cause);

  final Object cause;

  @override
  String toString() => 'LocalDatabaseKeyUnavailable(${cause.runtimeType})';
}

/// S13 #26 (MASVS-STORAGE-1): the key of the encrypted local databases
/// (SQLite3MultipleCiphers, see `encrypted_database.dart`).
///
/// 32 random bytes from the platform's secure generator, kept in
/// [TokenSecureStore.hardenedStorage]: the iOS Keychain class
/// `first_unlock_this_device` (never in a backup restored on another phone,
/// readable after the first unlock, so a push in the background can open
/// the caches) and the Android keystore-backed storage. A phone restored
/// from a backup has the files but not the key: the caches are rebuilt and
/// the queues are moved aside, which is the intended result.
class LocalDatabaseKey {
  LocalDatabaseKey([FlutterSecureStorage? storage])
      : _storage = storage ?? TokenSecureStore.hardenedStorage;

  /// The app's one instance (all encrypted databases share the key, so it is
  /// created once even when they open at the same moment).
  static final LocalDatabaseKey instance = LocalDatabaseKey();

  static const storageKey = 'lawbid.local_db_key.v1';

  final FlutterSecureStorage _storage;
  Future<String>? _key;

  /// The passphrase (base64 of the 32 bytes). Throws
  /// [LocalDatabaseKeyUnavailable] when it cannot be read or saved; a failed
  /// attempt is not remembered, so the next database open asks again.
  Future<String> passphrase() => _key ??= _load().then(
        (key) => key,
        onError: (Object e, StackTrace st) {
          _key = null;
          Error.throwWithStackTrace(e, st);
        },
      );

  Future<String> _load() async {
    String? stored;
    try {
      stored = await _storage.read(key: storageKey);
    } on Object catch (e) {
      // Never make a new key over one that could not be read: the files it
      // opens would be lost.
      throw LocalDatabaseKeyUnavailable(e);
    }
    if (stored != null && stored.isNotEmpty) return stored;
    final random = Random.secure();
    final key =
        base64Encode(List<int>.generate(32, (_) => random.nextInt(256)));
    try {
      await _storage.write(key: storageKey, value: key);
      // Read back: the key is only used once it is really stored, otherwise
      // the next start would get another key and lose the files.
      final saved = await _storage.read(key: storageKey);
      if (saved != key) {
        throw StateError('the database key did not persist');
      }
    } on Object catch (e) {
      throw LocalDatabaseKeyUnavailable(e);
    }
    return key;
  }
}
