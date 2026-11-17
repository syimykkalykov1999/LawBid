import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import 'fake_group_repository.dart';

/// Groups WhatsApp parity (the 1:1 `messages_on_device_test`): a group
/// thread is saved on the phone in the 1:1 message store; the next open
/// shows the copy with no page request, the server is asked only for what
/// came after the newest message (`afterId`); too much missed (409) or a
/// newest message the server no longer has (404) drops the copy and reads
/// the page; no network keeps the copy without an error.
const _key = (groupId: 'g1', topicId: null);

class _OfflineRepo extends FakeGroupRepository {
  _OfflineRepo(super.items, super.detail, super.thread);

  ApiException? afterError;

  @override
  Future<List<api.GroupMessageDto>> messagesAfter(
    String id,
    String afterId, {
    String? topicId,
  }) async {
    afterCalls++;
    final e = afterError;
    if (e != null) throw e;
    return after ?? const [];
  }
}

void main() {
  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);

  late CacheDatabase cache;
  setUp(() => cache = CacheDatabase(NativeDatabase.memory()));
  tearDown(() => cache.close());

  ProviderContainer open(FakeGroupRepository repo) {
    final c = ProviderContainer(
      overrides: [
        groupRepositoryProvider.overrideWithValue(repo),
        realtimeClientProvider.overrideWithValue(null),
        currentUserIdProvider.overrideWithValue('me'),
        cacheDatabaseProvider.overrideWithValue(cache),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 120));

  Future<GroupThreadState> visit(ProviderContainer c) async {
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    await settle();
    final s = c.read(groupThreadProvider(_key));
    sub.close();
    await settle();
    return s;
  }

  final page = [
    message('m3', body: 'third', minutes: 3),
    message('m2', body: 'second', minutes: 2),
    message('m1', body: 'first', minutes: 1),
  ];

  test(
      'first open reads the page and saves it; the next open is the copy '
      'plus only what came after it', () async {
    final repo = FakeGroupRepository(const [], groupDetail(), page);
    var s = await visit(open(repo));
    expect(s.messages.map((m) => m.id), ['m3', 'm2', 'm1']);
    expect(repo.messagesCalls, 1);
    expect(repo.afterCalls, 0);

    // A fresh app start (new memory) on the same phone.
    final again = FakeGroupRepository(const [], groupDetail())
      ..after = [message('m4', body: 'fourth', minutes: 4)];
    s = await visit(open(again));
    expect(again.messagesCalls, 0, reason: 'no page: the copy is shown');
    expect(again.afterCalls, 1, reason: 'only afterId = the newest saved');
    expect(s.messages.map((m) => m.id), ['m4', 'm3', 'm2', 'm1']);
    expect(s.loading, isFalse);
    expect(s.nextCursor, GroupThread.localCursor);
  });

  test('a message that came while the group was open is in the copy', () async {
    // An empty group: the fake answers a send with the sent text.
    final repo = FakeGroupRepository(const [], groupDetail());
    final c = open(repo);
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    await settle();
    await c.read(groupThreadProvider(_key).notifier).sendText('hello');
    await settle();
    sub.close();
    await settle();
    final saved = await c
        .read(groupMessageStoreProvider)!
        .page(groupThreadStoreKey(_key));
    expect(saved.map((m) => m.body), contains('hello'));
  });

  test('409 (too much missed) or 404 drops the copy and reads the page',
      () async {
    await visit(open(FakeGroupRepository(const [], groupDetail(), page)));
    for (final error in [
      const ApiException(code: ApiErrorCodes.syncTooOld, message: ''),
      const ApiException(
        code: ApiErrorCodes.notFound,
        message: '',
        statusCode: 404,
      ),
    ]) {
      final repo = _OfflineRepo(
          const [],
          groupDetail(),
          [
            message('n1', body: 'fresh', minutes: 9),
          ])
        ..afterError = error;
      final s = await visit(open(repo));
      expect(repo.afterCalls, 1);
      expect(repo.messagesCalls, 1, reason: '${error.code}: the page again');
      expect(s.messages.map((m) => m.id), ['n1']);
    }
  });

  test('no network: the copy stays, no error, no page request', () async {
    await visit(open(FakeGroupRepository(const [], groupDetail(), page)));
    final repo = _OfflineRepo(const [], groupDetail(), const [])
      ..afterError = const ApiException(
        code: ApiException.networkErrorCode,
        message: 'offline',
      );
    final s = await visit(open(repo));
    expect(repo.messagesCalls, 0);
    expect(s.error, isNull);
    expect(s.messages.map((m) => m.id), ['m3', 'm2', 'm1']);
  });

  test('older messages come from the phone first, then the server page',
      () async {
    final many = [
      for (var i = 80; i >= 1; i--) message('m$i', body: 'b$i', minutes: i),
    ];
    final first = FakeGroupRepository(const [], groupDetail(), many);
    await visit(open(first));
    final repo = FakeGroupRepository(const [], groupDetail(), many);
    final c = open(repo);
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    addTearDown(sub.close);
    await settle();
    // The disk page is 50; the rest is read from the disk, not the server.
    expect(c.read(groupThreadProvider(_key)).messages, hasLength(50));
    await c.read(groupThreadProvider(_key).notifier).loadMore();
    await settle();
    expect(c.read(groupThreadProvider(_key)).messages, hasLength(80));
    expect(repo.messagesCalls, 0);
  });

  test('a topic keeps its own copy, apart from the whole group', () {
    expect(groupThreadStoreKey(_key), 'group:g1');
    expect(
      groupThreadStoreKey((groupId: 'g1', topicId: 't1')),
      'group:g1/t1',
    );
  });
}
