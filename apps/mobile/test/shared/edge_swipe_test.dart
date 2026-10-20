import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/shared/presentation/edge_swipe.dart';

void main() {
  testWidgets('the middle of a row turns the page; the edges act',
      (tester) async {
    var started = 0;
    var ended = 0;
    final pages = PageController();
    addTearDown(pages.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PageView(
            controller: pages,
            children: [
              EdgeSwipe(
                key: const ValueKey('row'),
                onStart: () => started++,
                onEnd: () => ended++,
                startBackground: const ColoredBox(color: Colors.amber),
                endBackground: const ColoredBox(color: Colors.blue),
                child: const SizedBox.expand(child: Text('row')),
              ),
              const Text('next page'),
            ],
          ),
        ),
      ),
    );
    final rect = tester.getRect(find.byKey(const ValueKey('row')));
    // From the leading edge towards the end: the action, the page stays.
    await tester.dragFrom(
      Offset(rect.left + 8, rect.center.dy),
      const Offset(200, 0),
    );
    await tester.pumpAndSettle();
    expect(started, 1);
    expect(pages.page, 0);
    // From the trailing edge towards the start: the other action.
    await tester.dragFrom(
      Offset(rect.right - 8, rect.center.dy),
      const Offset(-200, 0),
    );
    await tester.pumpAndSettle();
    expect(ended, 1);
    // From the middle: no action, the section changes.
    await tester.dragFrom(rect.center, const Offset(-600, 0));
    await tester.pumpAndSettle();
    expect(started + ended, 2);
    expect(pages.page, 1);
  });
}
