import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// D1-16 (13.11): big values (the contact-book hashes, up to ~1.3 MB) kept
/// OUT of the small-settings store. [LocalKvStore] is the legacy
/// SharedPreferences ('FlutterSharedPreferences' XML on Android): the whole
/// file is read before the first frame (natively in MainActivity.onCreate
/// and again by `SharedPreferences.getInstance()`), and Android rewrites
/// the whole file on every small write (events queue, drafts, call marks),
/// so one big value slowed the cold start and every write.
///
/// This store is the same plugin's [SharedPreferencesAsync] (shared_preferences
/// 2.5, its documented API as is): on Android its own DataStore file, read
/// only when asked, never at start. A value still in the old store moves
/// over on its first read. Where the async store is missing (tests, an old
/// build) everything stays in [LocalKvStore], as before.
class LargeValueStore {
  LargeValueStore(this._kv, {SharedPreferencesAsync? store})
      : _store = store ?? _open();

  final LocalKvStore _kv;
  final SharedPreferencesAsync? _store;

  static SharedPreferencesAsync? _open() {
    try {
      return SharedPreferencesAsync();
    } on Object {
      // No async platform (flutter test): the old store.
      return null;
    }
  }

  Future<String?> getString(String key) async {
    final store = _store;
    if (store == null) return _kv.getString(key);
    try {
      final v = await store.getString(key);
      if (v != null) return v;
      final legacy = _kv.getString(key);
      if (legacy != null) {
        await store.setString(key, legacy);
        await _kv.remove(key);
      }
      return legacy;
    } on Object catch (e) {
      debugPrint('large value $key: $e');
      return _kv.getString(key);
    }
  }

  Future<void> setString(String key, String value) async {
    final store = _store;
    if (store == null) return _kv.setString(key, value);
    try {
      await store.setString(key, value);
      if (_kv.getString(key) != null) await _kv.remove(key);
    } on Object catch (e) {
      debugPrint('large value $key: $e');
      await _kv.setString(key, value);
    }
  }

  Future<void> remove(String key) async {
    await _kv.remove(key);
    try {
      await _store?.remove(key);
    } on Object catch (e) {
      debugPrint('large value $key: $e');
    }
  }

  /// Removes every key [matches] accepts, in both stores (the sign-out and
  /// account-switch wipe).
  Future<void> removeWhere(bool Function(String key) matches) async {
    await _kv.removeWhere(matches);
    final store = _store;
    if (store == null) return;
    final keys = await store.getKeys();
    for (final key in keys.where(matches)) {
      await store.remove(key);
    }
  }
}

final largeValueStoreProvider = Provider<LargeValueStore>(
  (ref) => LargeValueStore(ref.watch(localKvStoreProvider)),
);
