import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/cases_list_filter.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/mine/presentation/widgets/mine_grid.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-11-09: the filter icon of the cases screen sits LEFT of the
/// search magnifier (the attorney's bookmark stays at the far end); its
/// sheet offers «Новые», «По этапам», «В работе» / «Открыт» / «Ждёт меня»
/// and «Дата»; a pick comes back as the list's search / filter.
void main() {
  setUpAll(initializeDateFormatting);

  Future<MineSearch> pump(
    WidgetTester tester, {
    MineSearch initial = const MineSearch(),
    bool attorney = false,
    bool bookmark = true,
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(360, 760);
    addTearDown(tester.view.reset);
    var search = initial;
    await tester.pumpWidget(
      uxApp(
        StatefulBuilder(
          builder: (context, setState) => Scaffold(
            body: MineChipsSearchRow(
              search: search,
              onChanged: (v) => setState(() => search = v),
              action: bookmark
                  ? AppIconButton(
                      key: const ValueKey('bookmark'),
                      compact: true,
                      icon: const AppIcon(AppIcons.bookmarkBorderRounded),
                      semanticLabel: 'saved',
                      onPressed: () {},
                    )
                  : null,
              filter: CasesListFilterButton(
                search: search,
                onChanged: (v) => setState(() => search = v),
                attorney: attorney,
              ),
              chips: FilterChips<AttorneyCasesSection>(
                key: const ValueKey('bids-sections'),
                compact: true,
                padding: EdgeInsets.zero,
                value: AttorneyCasesSection.active,
                options: const [
                  (AttorneyCasesSection.active, 'Active'),
                  (AttorneyCasesSection.completed, 'Finished'),
                ],
                onChanged: (_) {},
              ),
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(360, 760),
        overrides: uxOverrides(),
      ),
    );
    await tester.pumpAndSettle();
    return search;
  }

  testWidgets('the filter icon is left of the search icon, one row',
      (tester) async {
    await pump(tester);
    final filter =
        tester.getRect(find.byKey(const ValueKey('cases-list-filter')));
    final search =
        tester.getRect(find.byKey(const ValueKey('mine-search-open')));
    final bookmark = tester.getRect(find.byKey(const ValueKey('bookmark')));
    final chips = tester.getRect(find.byKey(const ValueKey('bids-sections')));
    expect((filter.center.dy - search.center.dy).abs(), lessThan(6));
    expect(chips.right, lessThanOrEqualTo(filter.left + 0.5));
    expect(filter.right, lessThanOrEqualTo(search.left + 0.5));
    expect(search.right, lessThanOrEqualTo(bookmark.left + 0.5));
    expect(tester.takeException(), isNull);
  });

  testWidgets('«Новые» picks stage 1 and shows a badge; again turns it off',
      (tester) async {
    await pump(tester);
    expect(find.byType(Badge), findsOneWidget);
    expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);

    await tester.tap(find.byKey(const ValueKey('cases-list-filter')));
    await tester.pumpAndSettle();
    // The client's sheet: every row.
    for (final k in [
      'cases-filter-new',
      'cases-filter-stages',
      'cases-filter-inWork',
      'cases-filter-open',
      'cases-filter-awaiting',
      'cases-filter-date',
    ]) {
      expect(find.byKey(ValueKey(k)), findsOneWidget, reason: k);
    }
    expect(find.byKey(const ValueKey('cases-filter-reset')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('cases-filter-new')));
    await tester.pumpAndSettle();
    expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isTrue);

    await tester.tap(find.byKey(const ValueKey('cases-list-filter')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('cases-filter-reset')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('cases-filter-new')));
    await tester.pumpAndSettle();
    expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
  });

  testWidgets('«Ждёт меня», then «Сбросить»', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const ValueKey('cases-list-filter')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cases-filter-awaiting')));
    await tester.pumpAndSettle();
    expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isTrue);
    await tester.tap(find.byKey(const ValueKey('cases-list-filter')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cases-filter-reset')));
    await tester.pumpAndSettle();
    expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
  });

  testWidgets('«По этапам» is a multi-pick; «Дата» a one-of', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const ValueKey('cases-list-filter')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cases-filter-stages')));
    await tester.pumpAndSettle();
    // Stages 1 and 3 of 5 (0 and 2 inside), then Done.
    await tester.tap(find.text('Stage 1 of 5'));
    await tester.tap(find.text('Stage 3 of 5'));
    await tester.pump();
    await tester.tap(find.textContaining('Done'));
    await tester.pumpAndSettle();
    expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isTrue);

    await tester.tap(find.byKey(const ValueKey('cases-list-filter')));
    await tester.pumpAndSettle();
    expect(find.text('Stage 1 of 5, Stage 3 of 5'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('cases-filter-date')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Oldest first'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cases-list-filter')));
    await tester.pumpAndSettle();
    expect(find.text('Oldest first'), findsOneWidget);
    expect(find.text('2'), findsOneWidget, reason: 'two filters on');
  });

  testWidgets('the attorney’s sheet has no «Новые» / «Открыт» / «Ждёт меня»',
      (tester) async {
    await pump(tester, attorney: true, bookmark: false);
    await tester.tap(find.byKey(const ValueKey('cases-list-filter')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('cases-filter-new')), findsNothing);
    expect(find.byKey(const ValueKey('cases-filter-open')), findsNothing);
    expect(find.byKey(const ValueKey('cases-filter-awaiting')), findsNothing);
    expect(find.byKey(const ValueKey('cases-filter-inWork')), findsOneWidget);
    expect(find.byKey(const ValueKey('cases-filter-stages')), findsOneWidget);
    expect(casesListStages(attorney: true), [2, 3]);
    expect(casesListStages(attorney: false), [0, 1, 2, 3]);
  });
}
