import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/navigation/shell/stable_under_cover.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_feed_screen.dart';
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

/// Owner 2026-11-04 (R-391): the «Фильтры» sheet opened over «Вопросов нет»
/// and the empty-state block jumped up, then slid back down. Opening a sheet
/// drops the keyboard, the system's bottom inset changes frame by frame and
/// the Scaffold under the sheet re-centred its content. A bottom sheet must
/// never change the layout of the screen beneath it.
void main() {
  setUpAll(initializeDateFormatting);

  Future<Finder> pumpScreen(WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    useNarrowPhone(tester);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            promotionsOffOverride,
            legalQaRepositoryProvider.overrideWithValue(_EmptyRepo()),
            actsAsAttorneyProvider.overrideWithValue(false),
          ],
        ),
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          // The same guard the main shell puts around the tabs.
          home: const StableUnderCover(child: QaFeedScreen()),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    return find.text('Вопросов нет');
  }

  testWidgets('empty state does not move while the filter sheet opens', (
    tester,
  ) async {
    final empty = await pumpScreen(tester);
    expect(empty, findsOneWidget);
    final before = tester.getTopLeft(empty).dy;

    await tester.tap(find.byKey(const ValueKey('qa-filter-button')));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 20));
      expect(tester.getTopLeft(empty).dy, before, reason: 'frame $i');
    }
    expect(find.text('Фильтры'), findsWidgets);
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(empty).dy, before);
  });

  testWidgets(
      'the keyboard going away under the sheet does not move the empty state',
      (tester) async {
    final empty = await pumpScreen(tester);
    // The keyboard is up when the sheet is asked for.
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pump();
    final before = tester.getTopLeft(empty).dy;

    await tester.tap(find.byKey(const ValueKey('qa-filter-button')));
    await tester.pump(const Duration(milliseconds: 20));
    // Opening the route drops the keyboard; the inset slides to zero.
    for (var i = 0; i < 30; i++) {
      tester.view.viewInsets = FakeViewPadding(bottom: 300 - i * 10.0);
      await tester.pump(const Duration(milliseconds: 16));
      expect(tester.getTopLeft(empty).dy, before, reason: 'frame $i');
    }
    tester.view.viewInsets = FakeViewPadding.zero;
    await tester.pumpAndSettle();
    expect(find.text('Фильтры'), findsWidgets);
    expect(tester.getTopLeft(empty).dy, before);
  });
}
