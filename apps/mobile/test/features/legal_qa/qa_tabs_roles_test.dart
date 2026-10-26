import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_feed_screen.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_tabs_bar.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
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

/// Owner 2026-10-22: the client's Q&A tabs looked cramped next to the
/// attorney's. One widget places them for both roles, so the segment and
/// every tab must have the very same geometry for client and attorney, in
/// every language, at 360 dp, without an overflow.
void main() {
  setUpAll(initializeDateFormatting);

  Future<List<Rect>> rects(
    WidgetTester tester, {
    required bool attorney,
    required Translator translator,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const QaFeedScreen(),
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: translator,
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            promotionsOffOverride,
            legalQaRepositoryProvider.overrideWithValue(_EmptyRepo()),
            actsAsAttorneyProvider.overrideWithValue(attorney),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.takeException(), isNull);
    final bar = find.byKey(const ValueKey('qa-tabs'));
    return [
      tester.getRect(bar),
      for (final tab in QaTab.values)
        tester.getRect(
          find
              .descendant(of: bar, matching: find.byType(AppPressable))
              .at(tab.index),
        ),
    ];
  }

  final translators = <String, Translator Function()>{
    'ru': () => const StaticTranslatorRu(),
    'en': () => const StaticTranslatorEn(),
    'ne': () => ShippedTranslator('ne'),
    'ar': () => ShippedTranslator('ar'),
    'de': () => ShippedTranslator('de'),
    'mr': () => ShippedTranslator('mr'),
  };

  for (final entry in translators.entries) {
    testWidgets('tabs: client and attorney look the same (${entry.key})', (
      tester,
    ) async {
      final client = await rects(
        tester,
        attorney: false,
        translator: entry.value(),
      );
      final lawyer = await rects(
        tester,
        attorney: true,
        translator: entry.value(),
      );
      expect(client, lawyer);
      final segment = client.first;
      expect(segment.width, lessThanOrEqualTo(QaTabsBar.maxWidth));
      // Wide, not cramped: the header minus the round filter and search
      // buttons (owner 2026-10-23), which are 44 dp each at its end.
      expect(segment.width, greaterThan(220));
      expect(segment.left, closeTo(AppSpacing.screenSide, 1));
      expect(segment.right, lessThanOrEqualTo(360 - 88));
      // Four tabs side by side, filling the segment.
      final tabs = client.skip(1).toList();
      for (var i = 1; i < tabs.length; i++) {
        expect(tabs[i].left, closeTo(tabs[i - 1].right, 0.5));
      }
    });
  }

  testWidgets('tabs: when every label fits its share, the four are equal', (
    tester,
  ) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Center(
          child: SizedBox(
            width: 300,
            child: QaTabsBar(
              value: QaTab.all,
              labels: const ['A', 'Bb', 'Ccc', 'Dd'],
              onChanged: (_) {},
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: narrowPhone,
        overrides: uxOverrides(),
      ),
    );
    final tabs = [
      for (var i = 0; i < 4; i++)
        tester.getRect(find.byType(AppPressable).at(i)),
    ];
    for (final t in tabs) {
      expect(t.width, closeTo(tabs.first.width, 0.5));
    }
    expect(tabs.first.width, closeTo((300 - 4) / 4, 0.5));
  });
}
