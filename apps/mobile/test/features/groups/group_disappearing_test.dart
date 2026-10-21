// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/groups/presentation/group_info_screen.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Owner 2026-10-21 (WhatsApp «Disappearing messages») in groups.
class _Repo extends FakeGroupRepository {
  _Repo(
    api.GroupDetailDto detail, [
    List<api.GroupMessageDto> thread = const [],
  ]) : super(const [], detail, thread);

  final sent = <api.UpdateGroupDto>[];

  @override
  Future<api.GroupDetailDto> update(String id, api.UpdateGroupDto body) async {
    sent.add(body);
    final s = body.disappearAfterS?.json?.toInt() ?? 0;
    return groupDetail(disappearAfterS: s == 0 ? null : s);
  }
}

void main() {
  setUpAll(initializeDateFormatting);
  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  Future<void> pump(WidgetTester tester, Widget home, _Repo repo) async {
    tester.view.physicalSize = const Size(390, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            partnerOffOverride,
            groupRepositoryProvider.overrideWithValue(repo),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
        child: MaterialApp(theme: AppTheme.light(), home: home),
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

  test('the group service line says who set which timer', () {
    const t = StaticTranslatorRu();
    final on = message(
      's1',
      body: '',
      type: api.GroupMessageDtoType.system,
      systemKind: 'disappearing',
      systemPeople: [people[0]],
      systemText: '86400',
    );
    final off = message(
      's2',
      body: '',
      type: api.GroupMessageDtoType.system,
      systemKind: 'disappearing',
      systemPeople: [people[0]],
      systemText: '0',
    );
    expect(
      groupSystemText(t, on),
      '${people[0].displayName}: исчезающие сообщения включены · 24 часа',
    );
    expect(
      groupSystemText(t, off),
      '${people[0].displayName}: исчезающие сообщения выключены',
    );
  });

  testWidgets('the info screen switches the timer through the picker',
      (tester) async {
    final repo = _Repo(groupDetail());
    await pump(tester, const GroupInfoScreen(groupId: 'g1'), repo);
    final row = find.byKey(const ValueKey('group-disappearing'));
    await tester.scrollUntilVisible(
      row,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.descendant(of: row, matching: find.text('Выкл.')),
      findsOneWidget,
    );
    await tester.tap(row);
    await tester.pumpAndSettle();
    await tester.tap(find.text('90 дней'));
    await tester.pumpAndSettle();
    expect(repo.sent.single.disappearAfterS?.json, 7776000);
    await settle(tester);
  });

  testWidgets('a member who cannot edit the info sees it but cannot change it',
      (tester) async {
    final repo = _Repo(
      groupDetail(owner: false, disappearAfterS: 604800),
    );
    await pump(tester, const GroupInfoScreen(groupId: 'g1'), repo);
    final row = find.byKey(const ValueKey('group-disappearing'));
    await tester.scrollUntilVisible(
      row,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.descendant(of: row, matching: find.text('7 дней')),
      findsOneWidget,
    );
    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(find.text('24 часа'), findsNothing);
    expect(repo.sent, isEmpty);
    await settle(tester);
  });

  testWidgets('the conversation hides expired messages and marks the timer',
      (tester) async {
    final repo = _Repo(
      groupDetail(disappearAfterS: 604800, withPinned: false),
      [
        message(
          'live',
          body: 'still here',
          minutes: 3,
          expiresAt: DateTime.now().add(const Duration(days: 1)),
        ),
        message(
          'gone',
          body: 'already gone',
          minutes: 2,
          expiresAt: DateTime.now().subtract(const Duration(minutes: 1)),
        ),
      ],
    );
    await pump(tester, const GroupConversationScreen(groupId: 'g1'), repo);
    expect(find.text('still here'), findsOneWidget);
    expect(find.text('already gone'), findsNothing);
    expect(find.byKey(const ValueKey('group-header-timer')), findsOneWidget);
    await settle(tester);
  });
}
