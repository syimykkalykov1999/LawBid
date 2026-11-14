import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/large_value_store.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The async store's own file (DataStore on Android), in memory.
class _FakeAsync implements SharedPreferencesAsync {
  final Map<String, String> values = {};

  @override
  Future<String?> getString(String key) async => values[key];

  @override
  Future<void> setString(String key, String value) async => values[key] = value;

  @override
  Future<void> remove(String key) async => values.remove(key);

  @override
  Future<Set<String>> getKeys({Set<String>? allowList}) async =>
      values.keys.toSet();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// D1-16 (13.11): the contact-book hashes (up to ~1.3 MB) leave the
/// small-settings file that is read before the first frame and rewritten
/// on every small write.
void main() {
  late LocalKvStore kv;
  late _FakeAsync async;
  late LargeValueStore store;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    kv = LocalKvStore(await SharedPreferences.getInstance());
    async = _FakeAsync();
    store = LargeValueStore(kv, store: async);
  });

  test('a write goes to its own store, not the settings file', () async {
    await store.setString('contacts_book_v1.u1', 'big');
    expect(async.values['contacts_book_v1.u1'], 'big');
    expect(kv.getString('contacts_book_v1.u1'), isNull);
    expect(await store.getString('contacts_book_v1.u1'), 'big');
  });

  test('a value left in the old file moves over on its first read', () async {
    await kv.setString('contacts_book_v1.u1', 'old');
    expect(await store.getString('contacts_book_v1.u1'), 'old');
    expect(kv.getString('contacts_book_v1.u1'), isNull);
    expect(async.values['contacts_book_v1.u1'], 'old');
  });

  test('the account wipe clears both stores', () async {
    await kv.setString('contacts_book_v1.u2', 'left');
    await store.setString('contacts_book_v1.u1', 'a');
    await store.setString('keep', 'b');
    await store.removeWhere((k) => k.startsWith('contacts_book_v1.'));
    expect(kv.getString('contacts_book_v1.u2'), isNull);
    expect(async.values.keys, ['keep']);
  });

  test('no async store (an old build, tests): the old file, as before',
      () async {
    final plain = LargeValueStore(kv);
    await plain.setString('k', 'v');
    expect(await plain.getString('k'), 'v');
    await plain.remove('k');
    expect(await plain.getString('k'), isNull);
  });
}
