import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/shell/tab_reselect.dart';

/// Owner 2026-10-06: a tap on the open tab scrolls it to the top and
/// refreshes it (Instagram-style); hidden tabs / sub-tabs stay untouched.
void main() {
  Widget list(ScrollController c, VoidCallback onRefresh) =>
      AppRefreshIndicator(
        onRefresh: () async => onRefresh(),
        child: ListView.builder(
          controller: c,
          itemCount: 200,
          itemBuilder: (_, i) => SizedBox(height: 80, child: Text('row $i')),
        ),
      );

  testWidgets(
      'scrolls the visible list to the top; a second tap at the top refreshes',
      (tester) async {
    final key = GlobalKey();
    final visible = ScrollController();
    final hiddenSubTab = ScrollController();
    final hiddenBranch = ScrollController();
    var visibleRefreshes = 0;
    var hiddenRefreshes = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: KeyedSubtree(
            key: key,
            child: Stack(
              children: [
                // An inactive shell branch.
                Offstage(
                  child: list(hiddenBranch, () => hiddenRefreshes++),
                ),
                // The open tab, with a hidden sub-tab (Feed: Posts | Cases).
                IndexedStack(
                  index: 1,
                  children: [
                    list(hiddenSubTab, () => hiddenRefreshes++),
                    list(visible, () => visibleRefreshes++),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );

    visible.jumpTo(5000);
    hiddenSubTab.jumpTo(3000);
    hiddenBranch.jumpTo(2000);
    await tester.pump();

    final done = scrollToTopAndRefresh(key.currentContext!);
    await tester.pumpAndSettle();
    await done;

    expect(visible.offset, 0);
    // Owner 2026-10-19 (Instagram): the first tap only scrolls up.
    expect(visibleRefreshes, 0);
    final again = scrollToTopAndRefresh(key.currentContext!);
    await tester.pumpAndSettle();
    await again;
    expect(visibleRefreshes, 1);
    expect(hiddenSubTab.offset, 3000);
    expect(hiddenBranch.offset, 2000);
    expect(hiddenRefreshes, 0);
  });

  testWidgets('already at the top: just refreshes', (tester) async {
    final key = GlobalKey();
    final c = ScrollController();
    var refreshes = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: KeyedSubtree(key: key, child: list(c, () => refreshes++)),
        ),
      ),
    );

    final done = scrollToTopAndRefresh(key.currentContext!);
    await tester.pumpAndSettle();
    await done;

    expect(c.offset, 0);
    expect(refreshes, 1);
  });
}
