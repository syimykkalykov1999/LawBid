import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/mine/presentation/widgets/mine_grid.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-28 (R-086): every filter chip and tab is as tall as the
/// round buttons beside chips (AppRoundChipButton.diameter, 32): the
/// segmented tabs, the chip rows, the search suggestions and the chips of
/// the active filters.
void main() {
  setUpAll(initializeDateFormatting);
  const h = AppRoundChipButton.diameter;

  testWidgets('chip rows, tabs and active-filter chips are 32 tall',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: Column(
            children: [
              PillTabs<int>(
                key: const ValueKey('tabs'),
                value: 0,
                tabs: const [(0, 'Posts'), (1, 'Reels'), (2, 'Cases')],
                onChanged: (_) {},
              ),
              FilterChips<int>(
                key: const ValueKey('chips'),
                value: 0,
                options: const [(0, 'Active'), (1, 'Done')],
                onChanged: (_) {},
              ),
              MineActiveFilters(
                key: const ValueKey('active'),
                search: const MineSearch(state: 'NY'),
                onChanged: (_) {},
              ),
            ],
          ),
        ),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
      ),
    );
    await tester.pumpAndSettle();
    // The tabs' frame is the 32 dp row (the border is painted inside it).
    final tabs = tester.getRect(
      find
          .descendant(
            of: find.byKey(const ValueKey('tabs')),
            matching: find.byWidgetPredicate(
              (w) => w is SizedBox && w.height == AppSizes.segmentedTabs,
            ),
          )
          .first,
    );
    expect(tabs.height, h);
    expect(
      tester
          .getRect(
            find
                .descendant(
                  of: find.byKey(const ValueKey('chips')),
                  matching: find.byType(AppChip),
                )
                .first,
          )
          .height,
      h,
    );
    final active = tester.getRect(
      find
          .descendant(
            of: find.byKey(const ValueKey('active')),
            matching: find.byType(Container),
          )
          .first,
    );
    expect(active.height, h);
  });

  testWidgets('search suggestion chips are 32 tall', (tester) async {
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: [
          ...uxOverrides(),
          currentUserIdProvider.overrideWithValue('u1'),
          searchSuggestionsProvider.overrideWith(
            (ref, q) async => const [
              SearchSuggestion(SuggestionKind.tag, 'divorce'),
              SearchSuggestion(SuggestionKind.practice, 'Family'),
            ],
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(TextField));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'di');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    final chip = tester.getRect(find.text('#divorce').first);
    // The chip around the label: the nearest Container above it.
    final box = tester.getRect(
      find
          .ancestor(
            of: find.text('#divorce'),
            matching: find.byType(Container),
          )
          .first,
    );
    expect(chip.height, lessThan(h));
    expect(box.height, h);
  });
}
