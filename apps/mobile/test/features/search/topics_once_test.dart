import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/search/presentation/widgets/search_tiles.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Owner 2026-10-19: one topic per area of law — #immigration and
/// #greencard are not two «Immigration» rows plus a third below.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('each area of law shows once in Topics', (tester) async {
    // Tall enough for the whole list to be built.
    const size = Size(390, 8000);
    tester.view
      ..physicalSize = size
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final search = FakeSearchRepository()
      ..trendingTags = const [
        TagInfo(tag: 'immigration', postsCount: 12),
        TagInfo(tag: 'greencard', postsCount: 5),
        TagInfo(
          tag: 'consumerrights',
          postsCount: 4,
          categoryCode: 'bankruptcy_and_debt',
        ),
        TagInfo(
            tag: 'debt', postsCount: 3, categoryCode: 'bankruptcy_and_debt'),
        TagInfo(tag: 'mediation', postsCount: 2),
      ];
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        size: size,
        overrides: [
          ...uxOverrides(search: search),
          currentUserIdProvider.overrideWithValue('u1'),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Topics'));
    await tester.pumpAndSettle();
    final areas = <String, int>{};
    final tags = <String>[];
    for (final e in find.byType(TopicRow).evaluate()) {
      final row = e.widget as TopicRow;
      if (row.categoryCode != null) {
        areas[row.categoryCode!] = (areas[row.categoryCode!] ?? 0) + 1;
      } else {
        tags.add(row.tag);
      }
    }
    expect(areas['immigration'], 1);
    expect(areas['bankruptcy_and_debt'], 1);
    expect(areas.values.every((n) => n == 1), isTrue);
    expect(tags, contains('mediation'));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 30));
  });
}
