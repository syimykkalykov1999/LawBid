import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/groups/presentation/group_info_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';
import 'call_screen_fakes.dart';

/// Owner 2026-11-04 (R-376): «пока что выруби групповые звонки, пусть будут
/// одиночные звонки». The `calls_group` switch: off = no call buttons in a
/// group chat or its info, no «Add participant» in a call; on = as before.
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

  test('the switch is off when the server has not said anything', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(groupCallsEnabledProvider), isFalse);
    expect(c.read(groupCallsProvider), isFalse);
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
            groupCallsProvider.overrideWithValue(on),
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

  for (final on in [false, true]) {
    final what = on ? findsOneWidget : findsNothing;
    final label = on ? 'on: shown' : 'off: hidden';

    testWidgets('group chat call buttons — $label', (tester) async {
      await pumpGroup(
        tester,
        const GroupConversationScreen(groupId: 'g1'),
        on: on,
      );
      expect(find.byKey(const ValueKey('group-audio-call')), what);
      expect(find.byKey(const ValueKey('group-video-call')), what);
      await settle(tester);
    });

    testWidgets('group info call actions — $label', (tester) async {
      await pumpGroup(tester, const GroupInfoScreen(groupId: 'g1'), on: on);
      expect(find.byKey(const ValueKey('group-action-audio')), what);
      expect(find.byKey(const ValueKey('group-action-video')), what);
      await settle(tester);
    });

    testWidgets('«Add participant» in a one-to-one call — $label',
        (tester) async {
      tester.view
        ..physicalSize = const Size(390, 844) * 3
        ..devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...uxOverrides(),
            ...callScreenFakeOverrides(
              callSession1to1(CallPhase.active),
              groupCalls: on,
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const CallScreen(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
      expect(find.byKey(const Key('call-btn-add')), what);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 5));
    });
  }
}
