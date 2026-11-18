import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/presentation/message_actions.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Groups WhatsApp parity: reactions on group messages, the 1:1 chat's
/// pieces — the quick reactions lead the long-press menu, a pick is sent
/// and shown as a chip under the bubble, a tap on my chip takes it away.
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

  testWidgets('the menu reacts; the chip shows; my chip takes it away',
      (tester) async {
    final repo = FakeGroupRepository(
      const [],
      groupDetail(withPinned: false),
      [message('m1', body: 'Court is at nine')],
    );
    await pump(tester, repo);
    expect(find.byType(ReactionChipRow), findsNothing);

    await tester.longPress(find.text('Court is at nine'));
    await tester.pumpAndSettle();
    for (final e in kQuickReactions) {
      expect(find.byKey(ValueKey('group-react-$e')), findsOneWidget);
    }
    await tester.tap(find.byKey(const ValueKey('group-react-👍')));
    await tester.pumpAndSettle();
    expect(repo.reacted, ['m1:👍']);
    expect(find.byType(ReactionChipRow), findsOneWidget);
    final chip = find.descendant(
      of: find.byType(ReactionChipRow),
      matching: find.text('👍'),
    );
    expect(chip, findsOneWidget);

    // My chip: a tap takes my reaction away.
    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(repo.reacted, ['m1:👍', 'm1:']);
    expect(find.byType(ReactionChipRow), findsNothing);
    await settle(tester);
  });

  testWidgets('my message: reactions and every row fit (the sheet scrolls)',
      (tester) async {
    final repo = FakeGroupRepository(
      const [],
      groupDetail(withPinned: false),
      [message('m1', body: 'My own note', mine: true)],
    );
    await pump(tester, repo);
    await tester.longPress(find.text('My own note'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('group-react-❤️')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('group-react-❤️')));
    await tester.pumpAndSettle();
    expect(repo.reacted, ['m1:❤️']);
    await settle(tester);
  });

  testWidgets('someone else’s chip: a tap puts the same emoji on',
      (tester) async {
    final repo = FakeGroupRepository(
      const [],
      groupDetail(withPinned: false),
      [
        message(
          'm1',
          body: 'Court is at nine',
          reactions: const [
            api.ReactionDto(emoji: '❤️', count: 2, mine: false),
          ],
        ),
      ],
    );
    await pump(tester, repo);
    expect(find.text('❤️ 2'), findsOneWidget);
    await tester.tap(find.text('❤️ 2'));
    await tester.pumpAndSettle();
    expect(repo.reacted, ['m1:❤️']);
    await settle(tester);
  });

  test('chips from the DTO: none when deleted or from an older server', () {
    final m = message(
      'm1',
      body: 'x',
      reactions: const [
        api.ReactionDto(emoji: '😂', count: 3, mine: true),
        api.ReactionDto(emoji: '🙏', count: 1, mine: false),
      ],
    );
    expect(m.myReaction, '😂');
    expect(m.reactionChips.map((r) => '${r.emoji}${r.count}${r.mine}'), [
      '😂3true',
      '🙏1false',
    ]);
    expect(m.asTombstone().reactionChips, isEmpty);
    expect(message('m2', body: 'x').reactionChips, isEmpty);
    expect(message('m2', body: 'x').myReaction, isNull);
    // A poll update keeps the reactions.
    expect(
      m.withPoll(poll('p1')).reactionChips.length,
      2,
    );
  });
}
