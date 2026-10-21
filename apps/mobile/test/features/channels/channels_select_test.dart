import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/presentation/channels_screen.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../groups/fake_group_repository.dart';
import 'channels_fakes.dart';

/// Owner 2026-10-21 (п.19, п.22, п.24): the Chats selection mode on the
/// Channels screen (groups and channels), and «+» for every role.
void main() {
  setUpAll(initializeDateFormatting);
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  Future<GoRouter> pump(
    WidgetTester tester, {
    FakeGroupRepository? groups,
    FakeChannelsRepository? channels,
    UserRole role = UserRole.attorney,
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 900);
    addTearDown(tester.view.reset);
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const ChannelsScreen()),
        GoRoute(
          path: GroupRoutes.create,
          builder: (_, __) => const Text('new group screen'),
        ),
        GoRoute(
          path: ChannelsRoutes.newChannel,
          builder: (_, __) => const Text('new channel screen'),
        ),
        GoRoute(path: '/chats', builder: (_, __) => const Text('chats')),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...channelsOverrides(channels ?? FakeChannelsRepository()),
          groupRepositoryProvider.overrideWithValue(
            groups ?? FakeGroupRepository([listGroup('g1'), listGroup('g2')]),
          ),
          currentUserRoleProvider.overrideWithValue(role),
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

  testWidgets(
      'group sheet «Select chats» picks right here: Selected: N, All, ×, '
      'the bottom bar; pin works for the groups', (tester) async {
    final groups = FakeGroupRepository([listGroup('g1'), listGroup('g2')]);
    await pump(tester, groups: groups);
    expect(find.byKey(const ValueKey('select-count')), findsNothing);
    expect(find.byType(ChatSelectionBar), findsNothing);

    await tester.longPress(find.byKey(const ValueKey('group-tile-g1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('group-menu-select')));
    await tester.pumpAndSettle();

    // Still the Channels screen, not Chats.
    expect(find.text('chats'), findsNothing);
    expect(find.byType(ChannelsScreen), findsOneWidget);
    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byKey(const ValueKey('select-all')), findsOneWidget);
    expect(find.byKey(const ValueKey('select-cancel')), findsOneWidget);
    expect(find.byType(ChatSelectionBar), findsOneWidget);
    for (final k in [
      'select-archive',
      'select-pin',
      'select-mute',
      'select-read',
      'select-delete',
    ]) {
      expect(find.byKey(ValueKey(k)), findsOneWidget, reason: k);
    }
    // The tabs and «+» give way to the selection header.
    expect(find.byKey(const ValueKey('channels-create')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('select-all')));
    await tester.pumpAndSettle();
    expect(find.text('2 selected'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('select-pin')));
    await tester.pumpAndSettle();
    expect(groups.updates, [
      'g1:pinned=true:hidden=null:muted=false:archived=null',
      'g2:pinned=true:hidden=null:muted=false:archived=null',
    ]);
    // Done: the picking is over.
    expect(find.byType(ChatSelectionBar), findsNothing);
    expect(find.byKey(const ValueKey('channels-create')), findsOneWidget);
    await end(tester);
  });

  testWidgets('× leaves the picking; a tap then opens rows again',
      (tester) async {
    await pump(tester);
    await tester.longPress(find.byKey(const ValueKey('group-tile-g1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('group-menu-select')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('group-tile-g2')));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('select-cancel')));
    await tester.pumpAndSettle();
    expect(find.byType(ChatSelectionBar), findsNothing);
    expect(find.byKey(const ValueKey('group-pick-g1')), findsNothing);
    await end(tester);
  });

  testWidgets(
      'a channel I follow: long press picks it; pin, archive and mute are on '
      '(read and delete are not)', (tester) async {
    final channels = FakeChannelsRepository()
      ..listed = [fakeChannel(subscribed: true)];
    await pump(tester, channels: channels);
    await tester.tap(find.text('Channels').last);
    await tester.pumpAndSettle();

    await tester.longPress(find.byKey(const ValueKey('channel-row-ch-1')));
    await tester.pumpAndSettle();
    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byKey(const ValueKey('channel-pick-ch-1')), findsOneWidget);

    bool enabled(String k) => tester
        .widget<Semantics>(
          find
              .ancestor(
                of: find.byKey(ValueKey(k)),
                matching: find.byType(Semantics),
              )
              .first,
        )
        .properties
        .enabled!;
    for (final k in ['select-mute', 'select-archive', 'select-pin']) {
      expect(enabled(k), isTrue, reason: k);
    }
    for (final k in ['select-read', 'select-delete']) {
      expect(enabled(k), isFalse, reason: k);
    }

    await tester.tap(find.byKey(const ValueKey('select-mute')));
    await tester.pumpAndSettle();
    expect(channels.calls, contains('mute:true'));
    expect(find.byType(ChatSelectionBar), findsNothing);
    await end(tester);
  });

  testWidgets(
      'a channel is pinned and archived into the channels\' own Archive',
      (tester) async {
    final channels = FakeChannelsRepository()
      ..listed = [fakeChannel(subscribed: true)];
    await pump(tester, channels: channels);
    await tester.tap(find.text('Channels').last);
    await tester.pumpAndSettle();

    await tester.longPress(find.byKey(const ValueKey('channel-row-ch-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('select-pin')));
    await tester.pumpAndSettle();
    expect(channels.calls, contains('organize:pinned=true'));

    await tester.longPress(find.byKey(const ValueKey('channel-row-ch-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('select-archive')));
    await tester.pumpAndSettle();
    expect(channels.calls, contains('organize:archived=true'));
    await end(tester);
  });

  testWidgets('each section shows its own «Archive» row, opening its screen',
      (tester) async {
    final channels = FakeChannelsRepository()
      ..listed = [fakeChannel(subscribed: true)]
      ..archivedListed = [fakeChannel(id: 'ch-2', subscribed: true)];
    await pump(tester, channels: channels);
    // Groups: none archived, no row.
    expect(find.byKey(const ValueKey('section-archive-row')), findsNothing);
    await tester.tap(find.text('Channels').last);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('section-archive-row')), findsOneWidget);
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('section-archive-count')))
          .data,
      '1',
    );
    await end(tester);
  });

  testWidgets('a client has «+»: a new group or a new channel', (tester) async {
    final router = await pump(tester, role: UserRole.client);
    expect(find.byKey(const ValueKey('channels-search-open')), findsOneWidget);
    expect(find.byKey(const ValueKey('channels-create')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('channels-create')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('channels-new-group')), findsOneWidget);
    expect(find.byKey(const ValueKey('channels-new-channel')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('channels-new-group')));
    await tester.pumpAndSettle();
    expect(find.text('new group screen'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('channels-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('channels-new-channel')));
    await tester.pumpAndSettle();
    expect(find.text('new channel screen'), findsOneWidget);
    await end(tester);
  });
}
