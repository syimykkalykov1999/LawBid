import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/features/chat/data/message_store.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Item 25 (review fix 2): the phone's copy of a chat keeps an end-to-end
/// encrypted message as it came — `mls` with its ciphertext — whatever the
/// screens were shown (the opened text, or «waiting» with an empty body);
/// a page read from the disk is handed to the decryption first.
void main() {
  late CacheDatabase cache;
  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    cache = CacheDatabase(NativeDatabase.memory());
  });
  tearDown(() => cache.close());

  api.MessageDto mls(String id) => api.MessageDto.fromJson({
        'id': id,
        'conversationId': 'c1',
        'senderId': 'ua',
        'type': 'mls',
        'body': '',
        'contactMasked': false,
        'createdAt': DateTime.utc(2026, 11, 25, 12).toIso8601String(),
        'revoked': false,
        'forwarded': false,
        'reactions': <Object>[],
        'pinned': false,
        'ciphertext': 'AAEAAgM=',
        'mlsEpoch': 3,
      });

  test('an opened or waiting encrypted message is stored as mls + ciphertext',
      () async {
    final primed = <List<String>>[];
    final store = MessageStore(
      cache,
      'me',
      limitBytes: () => 1 << 20,
      prime: (rows) async => primed.add([for (final r in rows) r.id]),
    );
    final e2ee = E2eeService(
      client: _NoClient(),
      ownerId: 'me',
      plaintexts: MemoryE2eePlaintextStore(),
      openEngine: (_) => Future<MlsEngine>.error(StateError('unused')),
    );
    // What the screens got: «waiting» (empty text) for one, the realtime
    // event's opened copy for the other — both reach the store.
    final waiting = e2ee.withPayload(mls('m1'), null);
    expect(waiting.type, api.MessageDtoType.text);
    expect(waiting.body, '');
    await store.put('c1', [waiting]);
    await store.putRaw('c1', e2ee.withPayload(mls('m2'), null).toJson());

    final rows = await store.page('c1');
    expect(rows, hasLength(2));
    for (final r in rows) {
      expect(r.type, api.MessageDtoType.mls);
      expect(r.ciphertext, 'AAEAAgM=');
      expect(r.mlsEpoch, 3);
      expect(r.body, '');
    }
    // The page went to the decryption before anything showed it.
    expect(primed.single.toSet(), {'m1', 'm2'});
  });
}

/// No server is needed here.
class _NoClient implements api.E2eeClient {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('no server in this test');
}
