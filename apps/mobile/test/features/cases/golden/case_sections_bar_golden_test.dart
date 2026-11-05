import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_sections.dart';

import '../../../helpers/ux_harness.dart';

/// Owner 2026-11-05: the case's sections in the top bar, beside the arrow, at
/// the narrowest width. Finnish with a bids count is the longest row the test
/// fonts can draw.
void main() {
  final rows = {
    'ru_open': ['Обзор', 'Биды 12', 'Файлы'],
    'ru_work': ['Обзор', 'Файлы', 'Задачи'],
    'fi_longest': ['Yleistä', 'Tarjoukset 12', 'Tiedostot'],
    'de_work': ['Übersicht', 'Dateien', 'Aufgaben'],
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
        bar.publish(
          items: e.value,
          index: 0,
          pages: pages,
          overviewShown: true,
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
        // Nothing shrinks below what can be read (13 sp × 0.75 ≈ 10 sp).
        for (final label in e.value) {
          final drawn = tester.getRect(find.text(label)).width;
          final full = tester.renderObject<RenderBox>(find.text(label));
          expect(drawn / full.size.width, greaterThanOrEqualTo(0.75));
        }
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
