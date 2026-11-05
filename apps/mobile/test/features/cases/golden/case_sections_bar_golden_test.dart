import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_sections.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

import '../../../helpers/ux_harness.dart';

/// Owner 2026-11-05: the case's sections in the top bar, between the arrow and
/// «…», at the narrowest width. Maltese has the longest labels the test fonts
/// can draw among the case's section names.
void main() {
  final rows = {
    'ru_client': ['Обзор', 'Ставки', 'Файлы', 'История'],
    'ru_work': ['Обзор', 'Файлы', 'Задачи', 'История'],
    'mt_longest': ['Ħarsa ġenerali', 'Offerti', 'Fajls', 'Storja'],
    'de_counts': ['Übersicht', 'Gebote 12', 'Dateien', 'Verlauf'],
  };

  for (final e in rows.entries) {
    for (final dir in TextDirection.values) {
      testWidgets('${e.key} ${dir.name} at 320 pt', (tester) async {
        tester.view.physicalSize = const Size(320, 80);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final pages = PageController();
        addTearDown(pages.dispose);
        final bar = CaseSectionsBar();
        addTearDown(bar.dispose);
        final theme = AppTheme.of(AppThemeId.values.last);
        await tester.pumpWidget(
          uxApp(
            Directionality(
              textDirection: dir,
              child: Scaffold(
                appBar: AppTopBar(
                  centerTitle: true,
                  leading: AppBackButton(semanticLabel: 'b', onPressed: () {}),
                  title: CaseSectionsTitle(
                    bar: bar,
                    fallback: const Text('t'),
                  ),
                  actions: [
                    TopBarIcon(
                      icon: AppIcons.moreHorizRounded,
                      label: 'm',
                      onTap: () {},
                    ),
                  ],
                ),
                body: PageView(
                  controller: pages,
                  children: const [SizedBox()],
                ),
              ),
            ),
            theme: theme,
            size: const Size(320, 80),
          ),
        );
        bar.publish(items: e.value, index: 0, pages: pages);
        await tester.pump();
        expect(tester.takeException(), isNull);
        final row = tester.getRect(find.byKey(const ValueKey('case-sections')));
        expect(row.center.dx, moreOrLessEquals(160, epsilon: 1));
        expect(row.left, greaterThanOrEqualTo(48));
        expect(row.right, lessThanOrEqualTo(320 - 48));
        await expectLater(
          find.byType(AppTopBar),
          matchesGoldenFile('goldens/case_sections_${e.key}_${dir.name}.png'),
        );
      });
    }
  }
}
