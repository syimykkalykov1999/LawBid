import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_banners.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-20: no pushes to attorneys; a compact banner in the feed
/// (once a day), a line in «Мои» and «Answers · best» under the rating.
void main() {
  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    QaSummary summary = const QaSummary(newCount: 3),
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        child,
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            promotionsOffOverride,
            qaSummaryProvider.overrideWith((ref) async => summary),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('banner shows the count and goes away for the day on swipe', (
    tester,
  ) async {
    await pump(tester, const QaNewQuestionsBanner());
    expect(
      find.text('Новые вопросы по вашей практике: 3'),
      findsOneWidget,
    );
    await tester.drag(
      find.byKey(const ValueKey('qa-new-banner')),
      const Offset(600, 0),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Новые вопросы'), findsNothing);
    // Remembered for today.
    await pump(tester, const QaNewQuestionsBanner());
    expect(find.textContaining('Новые вопросы'), findsNothing);
  });

  testWidgets('no banner without fresh questions', (
    tester,
  ) async {
    await pump(
      tester,
      const QaNewQuestionsBanner(),
      summary: const QaSummary(),
    );
    expect(find.textContaining('Новые вопросы'), findsNothing);
  });

  testWidgets('profile: own row has the call and the numbers', (tester) async {
    await pump(
      tester,
      const QaProfileRow(answers: 12, best: 4, isSelf: true),
    );
    expect(
      find.text('Отвечайте на вопросы — привлекайте клиентов'),
      findsOneWidget,
    );
    expect(find.text('Ответов 12 · лучших 4'), findsOneWidget);
  });

  testWidgets('profile: nobody but the attorney sees the row', (tester) async {
    await pump(
      tester,
      const QaProfileRow(answers: 12, best: 4, isSelf: false),
    );
    expect(find.byKey(const ValueKey('profile-qa')), findsNothing);
  });

  group('admin settings', () {
    Future<void> banner(WidgetTester tester, QaSummary s) =>
        pump(tester, const QaNewQuestionsBanner(), summary: s);

    testWidgets('switched off: no card', (tester) async {
      await banner(tester, const QaSummary(newCount: 5, bannerEnabled: false));
      expect(find.textContaining('Новые вопросы'), findsNothing);
    });

    testWidgets('below the minimum: no card', (tester) async {
      await banner(tester, const QaSummary(newCount: 2, bannerMinNew: 3));
      expect(find.textContaining('Новые вопросы'), findsNothing);
    });

    testWidgets('at the minimum: the card', (tester) async {
      await banner(tester, const QaSummary(newCount: 3, bannerMinNew: 3));
      expect(find.textContaining('Новые вопросы'), findsOneWidget);
    });

    testWidgets('comes back only after the interval', (tester) async {
      const hour = Duration.millisecondsPerHour;
      final now = DateTime.now().millisecondsSinceEpoch;
      SharedPreferences.setMockInitialValues({'qa.banner.at': now - 5 * hour});
      prefs = await SharedPreferences.getInstance();
      await banner(
        tester,
        const QaSummary(newCount: 4, bannerIntervalHours: 6),
      );
      expect(find.textContaining('Новые вопросы'), findsNothing);
      SharedPreferences.setMockInitialValues({'qa.banner.at': now - 7 * hour});
      prefs = await SharedPreferences.getInstance();
      await banner(
        tester,
        const QaSummary(newCount: 4, bannerIntervalHours: 6),
      );
      expect(find.textContaining('Новые вопросы'), findsOneWidget);
    });

    testWidgets('profile call off: only the numbers', (tester) async {
      await pump(
        tester,
        const QaProfileRow(answers: 3, best: 1, isSelf: true),
        summary: const QaSummary(profileCtaEnabled: false),
      );
      expect(find.textContaining('Отвечайте'), findsNothing);
      expect(find.text('Ответов 3 · лучших 1'), findsOneWidget);
    });
  });
}
