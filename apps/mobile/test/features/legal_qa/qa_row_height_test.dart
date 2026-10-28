import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
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

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await loadAppFonts();
  });

  testWidgets('Q&A segment is as tall as the round buttons', (tester) async {
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
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            promotionsOffOverride,
            legalQaRepositoryProvider.overrideWithValue(_EmptyRepo()),
            actsAsAttorneyProvider.overrideWithValue(true),
          ],
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    // Owner 2026-10-28: the segment is exactly as tall as the round
    // filter / search buttons beside it, on one centre line.
    final bar = tester.getRect(find.byKey(const ValueKey('qa-tabs')));
    for (final key in ['qa-filter-button', 'qa-search-open']) {
      final circle = tester.getRect(
        find
            .descendant(
              of: find.byKey(ValueKey(key)),
              matching: find.byType(Container),
            )
            .first,
      );
      expect(bar.height, circle.height);
      expect(bar.center.dy, circle.center.dy);
    }
    expect(bar.height, AppRoundChipButton.diameter);
    // Owner 2026-10-28: the row, pill and round buttons on one line.
    await expectLater(
      find.byType(QaFeedScreen),
      matchesGoldenFile('goldens/qa_row_height.png'),
    );
  });
}
