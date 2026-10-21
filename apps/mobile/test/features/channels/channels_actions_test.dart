import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channels_screen.dart';
import 'package:lawbid/features/channels/presentation/community_archive.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:visibility_detector/visibility_detector.dart';

import '../groups/fake_group_repository.dart';
import 'channels_fakes.dart';

/// Owner 2026-10-21 (inbox 22c / 22d / 27): the actions of the Channels
/// screen — each section's own archive, the menus of Mine · Following ·
/// Discover for groups and channels, mute for a picked time and its icon.
void main() {
  setUpAll(initializeDateFormatting);
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  Future<GoRouter> pump(
    WidgetTester tester, {
    FakeGroupRepository? groups,
    FakeChannelsRepository? channels,
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 900);
    addTearDown(tester.view.reset);
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const ChannelsScreen()),
        GoRoute(
          path: ChannelsRoutes.archivePattern,
          builder: (_, s) => CommunityArchiveScreen(
            channels: s.pathParameters['kind'] == 'channels',
          ),
        ),
        GoRoute(
          path: ChannelsRoutes.channelPattern,
          builder: (_, s) => Text('channel ${s.pathParameters['id']}'),
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...channelsOverrides(channels ?? FakeChannelsRepository()),
          groupRepositoryProvider.overrideWithValue(
            groups ?? FakeGroupRepository([listGroup('g1')]),
          ),
          currentUserRoleProvider.overrideWithValue(UserRole.attorney),
        ],
        child: MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  Future<void> end(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  }

  Future<void> tab(WidgetTester tester, String label) async {
    await tester.tap(find.text(label).first);
    await tester.pumpAndSettle();
  }

  Future<void> toChannels(WidgetTester tester) async {
    await tester.tap(find.text('Channels').last);
    await tester.pumpAndSettle();
  }

  Future<void> menuOf(WidgetTester tester, String key) async {
    await tester.longPress(find.byKey(ValueKey(key)));
    await tester.pumpAndSettle();
  }

  Future<void> close(WidgetTester tester) async {
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
  }

  bool shown(String key) => find.byKey(ValueKey(key)).evaluate().isNotEmpty;

  group('each section has its own archive', () {
    testWidgets('Groups: «Archive» on top, its screen lists archived groups',
        (tester) async {
      final groups = FakeGroupRepository([listGroup('g1')])
        ..archivedItems = [listGroup('g7')];
      await pump(tester, groups: groups);
      // Following and Mine both lead with the Groups archive.
      expect(find.byKey(const ValueKey('groups-archive-row')), findsOneWidget);
      await tab(tester, 'Mine');
      expect(find.byKey(const ValueKey('groups-archive-row')), findsOneWidget);
      // Discover has no archive.
      await tab(tester, 'Discover');
      expect(find.byKey(const ValueKey('groups-archive-row')), findsNothing);
      await tab(tester, 'Mine');

      await tester.tap(find.byKey(const ValueKey('groups-archive-row')));
      await tester.pumpAndSettle();
      expect(find.byType(CommunityArchiveScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('group-tile-g7')), findsOneWidget);
      expect(find.byKey(const ValueKey('group-tile-g1')), findsNothing);
      // The menu there brings the group back.
      await menuOf(tester, 'group-tile-g7');
      expect(find.text('Unarchive'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('group-menu-archive')));
      await tester.pumpAndSettle();
      expect(groups.updates.last, contains('g7:'));
      expect(groups.updates.last, contains('archived=false'));
      await end(tester);
    });

    testWidgets('Channels: «Archive» on top of channels only, not of groups',
        (tester) async {
      final channels = FakeChannelsRepository()
        ..listed = [fakeChannel(subscribed: true)]
        ..archivedList = [
          fakeChannel(id: 'ch-9', subscribed: true, archived: true),
        ];
      await pump(tester, channels: channels);
      expect(find.byKey(const ValueKey('channels-archive-row')), findsNothing);
      await toChannels(tester);
      expect(
        find.byKey(const ValueKey('channels-archive-row')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('groups-archive-row')), findsNothing);

      await tester.tap(find.byKey(const ValueKey('channels-archive-row')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('channel-row-ch-9')), findsOneWidget);
      await menuOf(tester, 'channel-row-ch-9');
      await tester.tap(find.byKey(const ValueKey('channel-menu-row-archive')));
      await tester.pumpAndSettle();
      expect(channels.calls, contains('me:ch-9:archived=false'));
      await end(tester);
    });

    testWidgets('archiving a channel from its row goes to the Channels archive',
        (tester) async {
      final channels = FakeChannelsRepository()
        ..listed = [fakeChannel(subscribed: true)];
      final groups = FakeGroupRepository([listGroup('g1')]);
      await pump(tester, channels: channels, groups: groups);
      await toChannels(tester);
      await menuOf(tester, 'channel-row-ch-1');
      await tester.tap(find.byKey(const ValueKey('channel-menu-row-archive')));
      await tester.pumpAndSettle();
      expect(channels.calls, contains('me:ch-1:archived=true'));
      // Nothing went to the groups (or the chats).
      expect(groups.updates, isEmpty);
      await end(tester);
    });
  });

  group('the actions of every tab', () {
    testWidgets('Mine: the full set for a group and for my channel',
        (tester) async {
      final channels = FakeChannelsRepository()
        ..listed = [
          fakeChannel(subscribed: true, role: ChannelRole.owner, unread: 3),
        ];
      final groups = FakeGroupRepository([listGroup('g1', unread: 2)]);
      await pump(tester, channels: channels, groups: groups);
      await tab(tester, 'Mine');

      await menuOf(tester, 'group-tile-g1');
      for (final k in [
        'group-menu-pin',
        'group-menu-mute',
        'group-menu-read',
        'group-menu-archive',
        'group-menu-select',
        'group-menu-hide',
        'group-menu-leave',
      ]) {
        expect(shown(k), isTrue, reason: k);
      }
      await tester.tap(find.byKey(const ValueKey('group-menu-read')));
      await tester.pumpAndSettle();
      expect(groups.updates, contains('read:g1:lm-g1'));

      await toChannels(tester);
      await menuOf(tester, 'channel-row-ch-1');
      for (final k in ['pin', 'mute', 'read', 'archive', 'select', 'delete']) {
        expect(shown('channel-menu-row-$k'), isTrue, reason: k);
      }
      // My own channel is deleted, not unsubscribed.
      expect(shown('channel-menu-row-unsubscribe'), isFalse);
      await tester.tap(find.byKey(const ValueKey('channel-menu-row-read')));
      await tester.pumpAndSettle();
      expect(channels.calls, contains('me:ch-1:read'));
      await end(tester);
    });

    testWidgets('Following: pin · mute · archive · select · leave',
        (tester) async {
      final channels = FakeChannelsRepository()
        ..listed = [fakeChannel(subscribed: true, unread: 3)];
      final groups = FakeGroupRepository([listGroup('g1', unread: 2)]);
      await pump(tester, channels: channels, groups: groups);

      await menuOf(tester, 'group-tile-g1');
      for (final k in [
        'group-menu-pin',
        'group-menu-mute',
        'group-menu-archive',
        'group-menu-select',
        'group-menu-leave',
      ]) {
        expect(shown(k), isTrue, reason: k);
      }
      expect(shown('group-menu-read'), isFalse);
      expect(shown('group-menu-hide'), isFalse);
      await tester.tap(find.byKey(const ValueKey('group-menu-leave')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Leave').last);
      await tester.pumpAndSettle();
      expect(groups.updates, contains('leave:g1'));

      await toChannels(tester);
      await menuOf(tester, 'channel-row-ch-1');
      for (final k in ['pin', 'mute', 'archive', 'select', 'unsubscribe']) {
        expect(shown('channel-menu-row-$k'), isTrue, reason: k);
      }
      expect(shown('channel-menu-row-read'), isFalse);
      await tester.tap(find.byKey(const ValueKey('channel-menu-row-pin')));
      await tester.pumpAndSettle();
      expect(channels.calls, contains('me:ch-1:pinned=true'));
      await menuOf(tester, 'channel-row-ch-1');
      await tester
          .tap(find.byKey(const ValueKey('channel-menu-row-unsubscribe')));
      await tester.pumpAndSettle();
      expect(channels.calls, contains('unsubscribe'));
      await end(tester);
    });

    testWidgets('Discover: subscribe or open a channel, join or open a group',
        (tester) async {
      final channels = FakeChannelsRepository()..listed = [fakeChannel()];
      final groups = FakeGroupRepository(
        [listGroup('g1')],
        null,
        const [],
        const [],
        const [],
        [
          const api.GroupInvitePreviewDto(
            id: 'g5',
            code: 'code5',
            title: 'Tax lawyers',
            type: api.GroupType.public,
            memberCount: 40,
            requiresApproval: false,
            requestPending: false,
            alreadyMember: false,
          ),
        ],
      );
      await pump(tester, channels: channels, groups: groups);
      await tab(tester, 'Discover');

      await menuOf(tester, 'group-reco-g5');
      expect(shown('group-preview-open'), isTrue);
      await tester.tap(find.byKey(const ValueKey('group-preview-join')));
      await tester.pumpAndSettle();
      expect(groups.updates, contains('join:code5'));

      await toChannels(tester);
      await menuOf(tester, 'channel-row-ch-1');
      expect(shown('channel-menu-row-open'), isTrue);
      expect(shown('channel-menu-row-pin'), isFalse);
      await tester
          .tap(find.byKey(const ValueKey('channel-menu-row-subscribe')));
      await tester.pumpAndSettle();
      expect(channels.calls, contains('subscribe'));
      await end(tester);
    });

    testWidgets('«+» and the magnifier are on every tab', (tester) async {
      await pump(tester);
      for (final t in ['Mine', 'Following', 'Discover']) {
        await tab(tester, t);
        expect(shown('channels-create'), isTrue, reason: t);
        expect(shown('channels-search-open'), isTrue, reason: t);
      }
      await end(tester);
    });
  });

  group('notifications off for a picked time (inbox 27)', () {
    testWidgets('a channel row: the bell asks 1 h · 8 h · 2 days · forever',
        (tester) async {
      final channels = FakeChannelsRepository()
        ..listed = [fakeChannel(subscribed: true)];
      await pump(tester, channels: channels);
      await toChannels(tester);
      expect(shown('channel-muted-ch-1'), isFalse);
      await menuOf(tester, 'channel-row-ch-1');
      await tester.tap(find.byKey(const ValueKey('channel-menu-row-mute')));
      await tester.pumpAndSettle();
      for (final k in ['hour', 'hours8', 'days2', 'forever']) {
        expect(shown('mute-for-$k'), isTrue, reason: k);
      }
      expect(find.text('For 2 days'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('mute-for-days2')));
      await tester.pumpAndSettle();
      expect(channels.calls, contains('me:ch-1:mutedUntil'));
      await end(tester);
    });

    testWidgets('a muted channel shows the crossed bell and unmutes at once',
        (tester) async {
      final channels = FakeChannelsRepository()
        ..listed = [
          fakeChannel(
            subscribed: true,
            mutedUntil: DateTime.now().add(const Duration(hours: 8)),
          ),
        ];
      await pump(tester, channels: channels);
      await toChannels(tester);
      expect(shown('channel-muted-ch-1'), isTrue);
      await menuOf(tester, 'channel-row-ch-1');
      expect(find.text('Unmute notifications'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('channel-menu-row-mute')));
      await tester.pumpAndSettle();
      expect(shown('mute-for-hour'), isFalse);
      expect(channels.calls, contains('me:ch-1:unmute'));
      await end(tester);
    });

    testWidgets('a timed mute that has passed shows no crossed bell',
        (tester) async {
      final channels = FakeChannelsRepository()
        ..listed = [
          fakeChannel(
            subscribed: true,
            muted: true,
            mutedUntil: DateTime.now().subtract(const Duration(minutes: 1)),
          ),
        ];
      await pump(tester, channels: channels);
      await toChannels(tester);
      expect(shown('channel-muted-ch-1'), isFalse);
      await end(tester);
    });

    testWidgets('a group row: mute asks how long, the row shows the bell',
        (tester) async {
      final groups = FakeGroupRepository([listGroup('g1')]);
      await pump(tester, groups: groups);
      await menuOf(tester, 'group-tile-g1');
      await tester.tap(find.byKey(const ValueKey('group-menu-mute')));
      await tester.pumpAndSettle();
      expect(shown('mute-for-days2'), isTrue);
      await tester.tap(find.byKey(const ValueKey('mute-for-hour')));
      await tester.pumpAndSettle();
      expect(groups.updates.last, contains('muted=true'));
      await close(tester);
      await end(tester);
    });

    testWidgets('a muted group shows the crossed bell', (tester) async {
      await pump(
        tester,
        groups: FakeGroupRepository([listGroup('g1', muted: true)]),
      );
      final tile = find.byKey(const ValueKey('group-tile-g1'));
      expect(
        find.descendant(
          of: tile,
          matching: find.byWidgetPredicate(
            (w) => w is AppIcon && w.icon == AppIcons.notificationsOffOutlined,
          ),
        ),
        findsOneWidget,
      );
      expect(find.byType(GroupChatTile), findsOneWidget);
      await end(tester);
    });
  });
}
