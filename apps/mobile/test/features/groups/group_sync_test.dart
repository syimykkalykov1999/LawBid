import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import 'fake_group_repository.dart';

/// Owner 2026-10-22 (client economy plan, package B): the groups list is
/// edited by events, never reloaded whole — 50 `group:message` = 0 GET;
/// a reconnect is one `updatedSince`; `409 SYNC_TOO_OLD` reloads the page;
/// the open thread catches up with `afterId`.
void main() {
  late FakeGroupRepository repo;
  late StreamController<RealtimeEvent> events;
  late ProviderContainer c;

  /// A container over [r]; the first call per test is the default one.
  ProviderContainer build(FakeGroupRepository r) {
    repo = r;
    final cache = CacheDatabase(NativeDatabase.memory());
    final social = SocialLocalDatabase(NativeDatabase.memory());
    final container = ProviderContainer(
      overrides: [
        groupRepositoryProvider.overrideWithValue(repo),
        realtimeClientProvider.overrideWithValue(null),
        realtimeEventsProvider.overrideWithValue(events.stream),
        currentUserIdProvider.overrideWithValue('u1'),
        cacheDatabaseProvider.overrideWithValue(cache),
        socialLocalDatabaseProvider.overrideWithValue(social),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await cache.close();
      await social.close();
    });
    return container;
  }

  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
    c = build(FakeGroupRepository([listGroup('g1'), listGroup('g2')]));
  });

  var seq = 0;
  Map<String, Object?> messageEvent(
    String groupId,
    String id, {
    bool mine = false,
  }) =>
      {
        'message': {
          ...message(id, body: 'hi $id', mine: mine).toJson(),
          'groupId': groupId,
          // Newer than the preview on the row (the fixtures are hours old).
          'createdAt':
              DateTime.now().add(Duration(seconds: ++seq)).toIso8601String(),
        },
        'lastMessageAt': DateTime.now().toIso8601String(),
      };

  test('50 group:message events = 0 GET, the row moves and counts', () async {
    final sub = c.listen(groupsProvider, (_, __) {});
    addTearDown(sub.close);
    await c.read(groupsProvider.future);
    expect(repo.listCalls, 1);
    for (var i = 0; i < 50; i++) {
      events.add(RealtimeEvent('group:message', messageEvent('g2', 'm$i')));
    }
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final items = c.read(groupsProvider).value!.items;
    expect(items.first.id, 'g2', reason: 'the active group moves up');
    expect(items.first.unreadCount, 50);
    expect(items.first.lastMessage?.id, 'm49');
    expect(repo.listCalls, 1);
    expect(repo.changedCalls, 0);
  });

  test('my own message: no unread; badge:update touches nothing', () async {
    final sub = c.listen(groupsProvider, (_, __) {});
    addTearDown(sub.close);
    await c.read(groupsProvider.future);
    events
      ..add(RealtimeEvent('group:message', messageEvent('g1', 'x', mine: true)))
      ..add(const RealtimeEvent('badge:update', {'chatsUnread': 9}));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(c.read(groupsProvider).value!.items.first.unreadCount, 0);
    expect(repo.listCalls, 1);
  });

  test('group:update with a card edits the row in place', () async {
    final sub = c.listen(groupsProvider, (_, __) {});
    addTearDown(sub.close);
    await c.read(groupsProvider.future);
    events.add(
      const RealtimeEvent('group:update', {
        'groupId': 'g1',
        'kind': 'info',
        'card': {'title': 'Renamed', 'memberCount': 7},
      }),
    );
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final g1 =
        c.read(groupsProvider).value!.items.firstWhere((g) => g.id == 'g1');
    expect(g1.title, 'Renamed');
    expect(g1.memberCount, 7);
    expect(g1.myRole, api.GroupRole.member, reason: 'my part is kept');
    expect(repo.listCalls, 1);
  });

  test('a reconnect is one updatedSince: changed rows merge, deleted leave',
      () async {
    final sub = c.listen(groupsProvider, (_, __) {});
    addTearDown(sub.close);
    await c.read(groupsProvider.future);
    repo.changed = SyncedPage(
      items: [listGroup('g3'), listGroup('g1', unread: 4)],
      deletedIds: const ['g2'],
      syncedAt: DateTime.utc(2026, 10, 22, 12),
    );
    events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
    await Future<void>.delayed(
      SyncedListNotifier.catchUpDelay + const Duration(milliseconds: 50),
    );
    final items = c.read(groupsProvider).value!.items;
    expect(items.map((g) => g.id).toSet(), {'g1', 'g3'});
    expect(items.firstWhere((g) => g.id == 'g1').unreadCount, 4);
    expect(repo.changedCalls, 1);
    expect(repo.listCalls, 1);
    expect(
      c.read(groupsProvider.notifier).syncedAt,
      DateTime.utc(2026, 10, 22, 12),
    );
  });

  test('a message in a group this list does not hold asks once', () async {
    final sub = c.listen(groupsProvider, (_, __) {});
    addTearDown(sub.close);
    await c.read(groupsProvider.future);
    repo.changed = SyncedPage(items: [listGroup('g9')]);
    events
      ..add(RealtimeEvent('group:message', messageEvent('g9', 'a')))
      ..add(RealtimeEvent('group:message', messageEvent('g9', 'b')));
    await Future<void>.delayed(
      SyncedListNotifier.catchUpDelay + const Duration(milliseconds: 50),
    );
    expect(repo.changedCalls, 1, reason: 'a burst is one request');
    expect(c.read(groupsProvider).value!.items.any((g) => g.id == 'g9'), true);
  });

  test('the open thread catches up with afterId after a reconnect', () async {
    c = build(
      FakeGroupRepository(
        [listGroup('g1')],
        null,
        [message('t1', body: 'old')],
      ),
    );
    const key = (groupId: 'g1', topicId: null);
    final sub = c.listen(groupThreadProvider(key), (_, __) {});
    addTearDown(sub.close);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(repo.messagesCalls, 1);
    repo.after = [message('t2', body: 'new', minutes: 2)];
    events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(repo.afterCalls, 1);
    expect(repo.messagesCalls, 1, reason: 'the page is not read again');
    expect(
      c.read(groupThreadProvider(key)).messages.map((m) => m.id),
      ['t2', 't1'],
    );
    // Too many missed (409): the page again.
    repo.after = null;
    events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(repo.messagesCalls, 2);
  });
}
