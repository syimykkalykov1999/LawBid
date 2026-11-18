import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/groups_gate.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Owner 2026-11-16 (row 183): the admin switch «Группы в чатах» (flag
/// `groups`, on by default, independent of «Сообщества» / `channels`). Off =
/// no group anywhere in the app and on the web: the lists are empty without
/// a request (and the saved copy is not shown), the group routes show
/// nothing, group notifications are left out of the bell list.
void main() {
  late StreamController<RealtimeEvent> events;

  ProviderContainer build(FakeGroupRepository repo, {required bool on}) {
    final cache = CacheDatabase(NativeDatabase.memory());
    final social = SocialLocalDatabase(NativeDatabase.memory());
    final c = ProviderContainer(
      overrides: [
        groupRepositoryProvider.overrideWithValue(repo),
        groupsEnabledProvider.overrideWithValue(on),
        realtimeClientProvider.overrideWithValue(null),
        realtimeEventsProvider.overrideWithValue(events.stream),
        currentUserIdProvider.overrideWithValue('u1'),
        cacheDatabaseProvider.overrideWithValue(cache),
        socialLocalDatabaseProvider.overrideWithValue(social),
      ],
    );
    addTearDown(() async {
      c.dispose();
      await cache.close();
      await social.close();
    });
    return c;
  }

  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
  });

  test('the flag is ON by default in the compiled-in defaults', () {
    expect(defaultFeatureFlags['groups'], isTrue);
  });

  test('off: my groups are empty and nothing is asked, also on refresh',
      () async {
    final repo = FakeGroupRepository([listGroup('g1'), listGroup('g2')]);
    final c = build(repo, on: false);
    final sub = c.listen(groupsProvider, (_, __) {});
    addTearDown(sub.close);
    final list = await c.read(groupsProvider.future);
    expect(list.items, isEmpty);
    await c.read(groupsProvider.notifier).refresh();
    c.read(groupsProvider.notifier).catchUp();
    await pumpEventQueue();
    expect(c.read(groupsProvider).value?.items, isEmpty);
    expect(repo.listCalls, 0);
    expect(await c.read(groupInvitesProvider.future), isEmpty);
    expect(c.read(unreadGroupsProvider), 0);
  });

  test('on: my groups come as before', () async {
    final repo = FakeGroupRepository([listGroup('g1'), listGroup('g2')]);
    final c = build(repo, on: true);
    final sub = c.listen(groupsProvider, (_, __) {});
    addTearDown(sub.close);
    final list = await c.read(groupsProvider.future);
    expect(list.items.map((g) => g.id), ['g1', 'g2']);
    expect(repo.listCalls, 1);
  });

  Widget gate({required bool on}) => ProviderScope(
        overrides: [
          ...uxOverrides(),
          groupsEnabledProvider.overrideWithValue(on),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const GroupsGate(child: Text('group screen')),
        ),
      );

  testWidgets('off: a group route shows nothing (a way back only)', (t) async {
    await t.pumpWidget(gate(on: false));
    await t.pump();
    expect(find.text('group screen'), findsNothing);
    expect(find.byKey(const ValueKey('groups-gate')), findsOneWidget);
  });

  testWidgets('on: the group route shows the screen', (t) async {
    await t.pumpWidget(gate(on: true));
    await t.pump();
    expect(find.text('group screen'), findsOneWidget);
    expect(find.byKey(const ValueKey('groups-gate')), findsNothing);
  });

  group('the bell list', () {
    AppNotification n(
      String id,
      String type, {
      NotifCategory category = NotifCategory.messages,
      Map<String, Object?> payload = const {},
    }) =>
        AppNotification(
          id: id,
          type: type,
          category: category,
          payload: payload,
          aggregateCount: 1,
          createdAt: DateTime(2026, 11, 16, 12),
        );

    Future<List<String>> visible({required bool groups}) async {
      final c = ProviderContainer(
        overrides: [
          notificationsProvider.overrideWith(
            () => _Fixed([
              n('1', 'group_invite', category: NotifCategory.groups),
              n('2', 'new_message', payload: const {'groupId': 'g1'}),
              n('3', 'new_message', payload: const {'conversationId': 'c1'}),
              n('4', 'group_call', payload: const {'groupId': 'g1'}),
              n('5', 'bid_new', category: NotifCategory.bids),
            ]),
          ),
          channelsEnabledProvider.overrideWithValue(true),
          groupsEnabledProvider.overrideWithValue(groups),
        ],
      );
      addTearDown(c.dispose);
      final sub = c.listen(visibleNotificationsProvider, (_, __) {});
      addTearDown(sub.close);
      await c.read(notificationsProvider.future);
      return [
        for (final x in c.read(visibleNotificationsProvider).requireValue.items)
          x.id,
      ];
    }

    test('off: invitations, group messages and group calls are left out',
        () async {
      expect(await visible(groups: false), ['3', '5']);
    });

    test('on: every row stays', () async {
      expect(await visible(groups: true), ['1', '2', '3', '4', '5']);
    });
  });
}

class _Fixed extends NotificationsNotifier {
  _Fixed(this.items);

  final List<AppNotification> items;

  @override
  Future<PaginatedList<AppNotification>> build() async =>
      PaginatedList(items: items);
}
