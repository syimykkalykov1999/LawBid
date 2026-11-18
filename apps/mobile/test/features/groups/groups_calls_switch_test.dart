import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/groups/presentation/group_info_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Owner 2026-11-16 18:25 CT (row 183): «Звонки в группах», the second
/// switch of «Группы в чатах». Off = no call buttons in a group chat or its
/// info; the group stays. `calls_group` held on here.
GroupCallPort _port() => GroupCallPort(
      start: (
        groupId, {
        required title,
        avatarUrl,
        video = false,
        userIds = const [],
      }) async =>
          null,
      running: (_) async => null,
    );

void main() {
  setUpAll(initializeDateFormatting);
  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  Future<void> pumpGroup(
    WidgetTester tester,
    Widget home, {
    required bool on,
  }) async {
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
            groupRepositoryProvider.overrideWithValue(
              FakeGroupRepository(const [], groupDetail()),
            ),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
            groupCallPortProvider.overrideWithValue(_port()),
            groupVideoCallsProvider.overrideWithValue(true),
            groupCallsProvider.overrideWithValue(true),
            groupChatCallsEnabledProvider.overrideWithValue(on),
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

  // Owner 2026-11-16 18:25 CT (row 183): «Звонки в группах» hides the call
  // buttons of group chats only; the groups themselves stay. 1:1 call code
  // is not touched (its own test file is unchanged).
  for (final on in [false, true]) {
    final what = on ? findsOneWidget : findsNothing;
    final label = on ? 'on: shown' : 'off: hidden, the chat stays';

    testWidgets('«Звонки в группах» — group chat call buttons — $label',
        (tester) async {
      await pumpGroup(
        tester,
        const GroupConversationScreen(groupId: 'g1'),
        on: on,
      );
      expect(find.byType(GroupConversationScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('group-audio-call')), what);
      expect(find.byKey(const ValueKey('group-video-call')), what);
      await settle(tester);
    });

    testWidgets('«Звонки в группах» — group info call actions — $label',
        (tester) async {
      await pumpGroup(tester, const GroupInfoScreen(groupId: 'g1'), on: on);
      expect(find.byKey(const ValueKey('group-action-audio')), what);
      expect(find.byKey(const ValueKey('group-action-video')), what);
      await settle(tester);
    });
  }

  test('both switches start on; groups off turns the calls off too', () {
    expect(defaultFeatureFlags['groups'], isTrue);
    expect(defaultFeatureFlags['groups_calls'], isTrue);
    final off = ProviderContainer(
      overrides: [groupsEnabledProvider.overrideWithValue(false)],
    );
    addTearDown(off.dispose);
    expect(off.read(groupChatCallsEnabledProvider), isFalse);
    final on = ProviderContainer(
      overrides: [groupsEnabledProvider.overrideWithValue(true)],
    );
    addTearDown(on.dispose);
    expect(on.read(groupChatCallsEnabledProvider), isTrue);
  });
}
