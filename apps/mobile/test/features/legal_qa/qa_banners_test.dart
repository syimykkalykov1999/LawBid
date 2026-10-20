import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
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
    int count = 3,
    bool attorney = true,
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
            qaNewCountProvider.overrideWith((ref) async => count),
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

  testWidgets('no banner and no «Мои» line without fresh questions', (
    tester,
  ) async {
    await pump(
      tester,
      const Column(children: [QaNewQuestionsBanner(), QaMineEntry()]),
      count: 0,
    );
    expect(find.textContaining('Новые вопросы'), findsNothing);
    expect(find.byKey(const ValueKey('mine-qa')), findsNothing);
  });

  testWidgets('«Мои» line: title and count', (tester) async {
    await pump(tester, const QaMineEntry(), count: 5);
    expect(find.text('Вопрос юристу · 5 новых'), findsOneWidget);
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

  testWidgets('profile: others see only numbers, and only if any', (
    tester,
  ) async {
    await pump(
      tester,
      const QaProfileRow(answers: 12, best: 4, isSelf: false),
    );
    expect(find.text('Ответов 12 · лучших 4'), findsOneWidget);
    expect(find.textContaining('Отвечайте'), findsNothing);
    await pump(
      tester,
      const QaProfileRow(answers: 0, best: 0, isSelf: false),
    );
    expect(find.byKey(const ValueKey('profile-qa')), findsNothing);
  });
}
