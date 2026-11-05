import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Owner 2026-10-21 (inbox 26c, Telegram): reactions in groups — the bar on
/// top of the long-press menu, chips under the message, and the admins'
/// all / selected / off.
void main() {
  setUpAll(initializeDateFormatting);

  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  Future<void> pump(WidgetTester tester, FakeGroupRepository repo) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            partnerOffOverride,
            groupRepositoryProvider.overrideWithValue(repo),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const GroupConversationScreen(groupId: 'g1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  }

  testWidgets('long press: the reaction bar puts mine; the chip shows it',
      (tester) async {
    final repo = FakeGroupRepository(
      const [],
      groupDetail(withPinned: false),
      [message('m1', body: 'Court at nine')],
    );
    await pump(tester, repo);
    await tester.longPress(find.text('Court at nine'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('group-react-bar')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('group-react-🎉')));
    await tester.pumpAndSettle();
    expect(repo.reacts, ['m1:🎉']);
    expect(find.byKey(const ValueKey('group-react-m1-🎉')), findsOneWidget);

    // Tapping my own chip takes it back.
    await tester.tap(find.byKey(const ValueKey('group-react-m1-🎉')));
    await tester.pumpAndSettle();
    expect(repo.reacts, ['m1:🎉', 'm1:-']);
    await settle(tester);
  });

  testWidgets('selected: only the ticked ones; a closed chip is not tappable',
      (tester) async {
    final repo = FakeGroupRepository(
      const [],
      groupDetail(
        withPinned: false,
        reactionsMode: api.ReactionMode.some,
        reactionsAllowed: const ['👍'],
      ),
      [
        message('m1', body: 'Court at nine', reactions: const {'🔥': 2}),
      ],
    );
    await pump(tester, repo);
    await tester.tap(find.byKey(const ValueKey('group-react-m1-🔥')));
    await tester.pumpAndSettle();
    expect(repo.reacts, isEmpty);

    await tester.longPress(find.text('Court at nine'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('group-react-👍')), findsOneWidget);
    expect(find.byKey(const ValueKey('group-react-🔥')), findsNothing);
    await settle(tester);
  });

  testWidgets('off: no bar in the menu', (tester) async {
    final repo = FakeGroupRepository(
      const [],
      groupDetail(withPinned: false, reactionsMode: api.ReactionMode.off),
      [message('m1', body: 'Court at nine')],
    );
    await pump(tester, repo);
    await tester.longPress(find.text('Court at nine'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('group-react-bar')), findsNothing);
    await settle(tester);
  });
}
