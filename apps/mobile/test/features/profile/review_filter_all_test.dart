import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-21: after a tap on ★5 / ★4 … there is a way back to all
/// the reviews — «All» in front of the grades (and a second tap on the
/// grade).
void main() {
  setUpAll(initializeDateFormatting);
  testWidgets('«All» clears the grade filter; a second tap on it too',
      (tester) async {
    int? stars;
    await tester.pumpWidget(
      uxApp(
        StatefulBuilder(
          builder: (context, setState) => Scaffold(
            body: ReviewSummaryPanel(
              summary: const ReviewSummary(
                average: 4.5,
                count: 10,
                distribution: {5: 6, 4: 2, 3: 1, 2: 1, 1: 0},
              ),
              selectedStars: stars,
              onStarsTap: (s) => setState(() => stars = stars == s ? null : s),
            ),
          ),
        ),
        theme: AppTheme.dark(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(),
      ),
    );
    await tester.pump();
    final all = find.byKey(const ValueKey('reviews-filter-all'));
    expect(all, findsOneWidget);
    await tester.tap(find.textContaining('4 · '));
    await tester.pump();
    expect(stars, 4);
    await tester.tap(all);
    await tester.pump();
    expect(stars, isNull);
    await tester.tap(find.textContaining('5 · '));
    await tester.pump();
    await tester.tap(find.textContaining('5 · '));
    await tester.pump();
    expect(stars, isNull);
    expect(tester.takeException(), isNull);
  });
}
