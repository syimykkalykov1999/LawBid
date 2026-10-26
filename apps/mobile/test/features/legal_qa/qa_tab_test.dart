import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_feed_screen.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/qa_notify_switch.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';

class _EmptyRepo extends LegalQaRepository {
  _EmptyRepo() : super(Dio());

  @override
  Future<CursorPage<Question>> list(
    QuestionsQuery query, {
    String? cursor,
  }) async =>
      const CursorPage(items: []);
}

class _Notifs implements NotificationsRepository {
  NotificationSettings s = const NotificationSettings(
    categories: [],
    topics: [
      // The server's default: Q&A notifications are off.
      TopicSetting(
        key: 'legalQa',
        block: 'cases',
        push: false,
        attorneyOnly: true,
      ),
    ],
  );
  final calls = <String>[];

  @override
  Future<NotificationSettings> settings() async => s;

  @override
  Future<NotificationSettings> updateTopics(List<TopicSetting> items) async {
    calls.add(items.map((i) => '${i.key}=${i.push}').join(','));
    final by = {for (final i in items) i.key: i};
    return s = s.copyWith(topics: [for (final x in s.topics) by[x.key] ?? x]);
  }

  @override
  Future<Badges> badges() async => const Badges();

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

/// Owner 2026-10-23: «Вопросы» is a tab of Cases; its switch for new-question
/// notifications starts OFF and turns them on and off.
void main() {
  setUpAll(initializeDateFormatting);

  Future<_Notifs> pump(WidgetTester tester, {required bool attorney}) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final repo = _Notifs();
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: QaFeedBody(embedded: true)),
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            promotionsOffOverride,
            legalQaRepositoryProvider.overrideWithValue(_EmptyRepo()),
            actsAsAttorneyProvider.overrideWithValue(attorney),
            qaNotifySwitchProvider
                .overrideWithValue(() => const QaNotifySwitch()),
            notificationsRepositoryProvider.overrideWithValue(repo),
            currentUserIdProvider.overrideWithValue('u1'),
            currentUserRoleProvider.overrideWithValue(
              attorney ? UserRole.attorney : UserRole.client,
            ),
            realtimeEventsProvider
                .overrideWithValue(const Stream<RealtimeEvent>.empty()),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.takeException(), isNull);
    return repo;
  }

  testWidgets('attorney: the notification switch starts off, opt-in works', (
    tester,
  ) async {
    final repo = await pump(tester, attorney: true);
    final sw = find.byKey(const ValueKey('qa-notify-switch'));
    expect(sw, findsOneWidget);
    expect(tester.widget<SwitchListTile>(sw).value, isFalse);
    await tester.tap(sw);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(repo.calls, ['legalQa=true']);
    expect(tester.widget<SwitchListTile>(sw).value, isTrue);
    await tester.tap(sw);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(repo.calls, ['legalQa=true', 'legalQa=false']);
  });

  testWidgets('client: no switch (nothing is broadcast to clients)', (
    tester,
  ) async {
    await pump(tester, attorney: false);
    expect(find.byKey(const ValueKey('qa-notify-switch')), findsNothing);
    // The sections and «Ask» are in the tab.
    expect(find.byKey(const ValueKey('qa-tabs')), findsOneWidget);
  });

  // The third Cases tab at its longest, in every shipped language at once.
  for (final scale in [1.0, 1.6]) {
    testWidgets('Cases tabs: Cases | Tasks | Q&A fit 320 dp (x$scale)', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(320, 700);
      addTearDown(tester.view.reset);
      final t = LongestTranslator();
      await tester.pumpWidget(
        uxApp(
          Scaffold(
            body: PillTabs<int>(
              value: 2,
              tabs: [
                (0, t.t('mine.tab.cases')),
                (1, t.t('mine.tab.tasks')),
                (2, t.t('mine.tab.qa')),
              ],
              onChanged: (_) {},
            ),
          ),
          theme: AppTheme.light(),
          size: const Size(320, 700),
          textScale: scale,
          overrides: uxOverrides(translator: t),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  }
}
