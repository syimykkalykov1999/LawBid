import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-19: no line under the case tabs; the chosen tab is told
/// by its text colour, which follows the swipe between two tabs.
void main() {
  Color colorOf(WidgetTester t, int i) =>
      t.widget<Text>(find.byKey(ValueKey('case-tab-label-$i'))).style!.color!;

  testWidgets('no line; the text colour follows the pages', (t) async {
    final pages = PageController();
    addTearDown(pages.dispose);
    final theme = AppTheme.light();
    final colors = theme.extension<AppColorTokens>()!;
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: Column(
            children: [
              CaseTextTabs(
                items: const [CaseTabItem('Overview'), CaseTabItem('Files')],
                index: 0,
                onChanged: (_) {},
                pages: pages,
              ),
              SizedBox(
                height: 200,
                child: PageView(
                  controller: pages,
                  children: const [SizedBox(), SizedBox()],
                ),
              ),
            ],
          ),
        ),
        theme: theme,
        size: const Size(360, 800),
      ),
    );
    await t.pump();
    expect(
      find.byWidgetPredicate((w) => w is ColoredBox && w.color == colors.gold),
      findsNothing,
    );
    expect(colorOf(t, 0), colors.text);
    expect(colorOf(t, 1), colors.textSecondary);

    pages.jumpTo(pages.position.maxScrollExtent / 2);
    await t.pump();
    expect(colorOf(t, 0), isNot(colors.text));
    expect(colorOf(t, 1), isNot(colors.textSecondary));

    pages.jumpTo(pages.position.maxScrollExtent);
    await t.pump();
    expect(colorOf(t, 0), colors.textSecondary);
    expect(colorOf(t, 1), colors.text);
  });
}
