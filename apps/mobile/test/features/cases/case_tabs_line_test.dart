import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-19: the line under the chosen tab is as wide as that tab's
/// label on every tab, and slides with the swipe between them.
void main() {
  Finder line(WidgetTester t) {
    final gold = AppTheme.light().extension<AppColorTokens>()!.gold;
    return find.byWidgetPredicate((w) => w is ColoredBox && w.color == gold);
  }

  testWidgets('the line spans the chosen tab and follows the pages', (t) async {
    final pages = PageController();
    addTearDown(pages.dispose);
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
        theme: AppTheme.light(),
        size: const Size(360, 800),
      ),
    );
    await t.pump();
    await t.pump();
    final first = t.getRect(find.text('Overview'));
    final second = t.getRect(find.text('Files'));
    final at0 = t.getRect(line(t));
    expect(at0.left, closeTo(first.left, 0.5));
    expect(at0.width, closeTo(first.width, 0.5));
    expect(at0.height, 2);

    pages.jumpTo(pages.position.maxScrollExtent / 2);
    await t.pump();
    final half = t.getRect(line(t));
    expect(half.left, greaterThan(at0.left));
    expect(half.left, lessThan(second.left));

    pages.jumpTo(pages.position.maxScrollExtent);
    await t.pump();
    final at1 = t.getRect(line(t));
    expect(at1.left, closeTo(second.left, 0.5));
    expect(at1.width, closeTo(second.width, 0.5));
  });
}
