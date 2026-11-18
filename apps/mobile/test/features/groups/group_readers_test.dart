import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_voters_sheet.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Groups WhatsApp parity («Данные»): my message's menu has the 1:1
/// «Seen» row; it opens who has read it, «N/M» over the list. Someone
/// else's message has no such row.
const _en = StaticTranslatorEn();

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

  testWidgets('my message: «Seen» opens who has read it', (tester) async {
    final repo = FakeGroupRepository(
      const [],
      groupDetail(withPinned: false),
      [
        message('m2', body: 'Their note', minutes: 2),
        message('m1', body: 'My note', mine: true, minutes: 1),
      ],
    )..readersOf = api.GroupMessageReadersDto(
        readers: [people[1], people[3]],
        recipients: 5,
      );
    await pump(tester, repo);

    await tester.longPress(find.text('Their note'));
    await tester.pumpAndSettle();
    expect(find.text(_en.t('chat.seen')), findsNothing);
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('My note'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_en.t('chat.seen')));
    await tester.pumpAndSettle();
    expect(repo.readersAsked, ['m1']);
    expect(find.byKey(const ValueKey('group-readers-count')), findsOneWidget);
    expect(find.text('2/5'), findsOneWidget);
    for (final p in [people[1], people[3]]) {
      expect(
        find.descendant(
          of: find.byType(PollVoterRow),
          matching: find.text(p.displayName!),
        ),
        findsOneWidget,
      );
    }
    await settle(tester);
  });
}
