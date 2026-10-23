import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/presentation/chat_swipe.dart';
import 'package:lawbid/shared/presentation/edge_swipe.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22: «back» by a swipe from the middle of the screen
/// (Instagram), without breaking carousels, tab pages and row actions.
/// docs/ux/GESTURES.md.
Future<void> _open(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: uxOverrides(),
      child: MaterialApp(
        theme: AppTheme.light().copyWith(
          pageTransitionsTheme: kBackSwipeTransitions,
        ),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => screen),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

/// A finger that starts at [from] and moves right by [dx].
Future<void> _swipeRight(WidgetTester tester, Offset from, double dx) async {
  final g = await tester.startGesture(from);
  for (var i = 0; i < 10; i++) {
    await g.moveBy(Offset(dx / 10, 1));
    await tester.pump(const Duration(milliseconds: 16));
  }
  await g.up();
  await tester.pumpAndSettle();
}

void main() {
  const middle = Offset(200, 500);

  testWidgets('post feed (vertical list): a swipe from the middle goes back',
      (tester) async {
    await _open(
      tester,
      Scaffold(
        body: ListView(
          children: [
            for (var i = 0; i < 20; i++)
              SizedBox(height: 300, child: Text('post $i')),
          ],
        ),
      ),
    );
    expect(find.text('post 0'), findsOneWidget);
    await _swipeRight(tester, middle, 300);
    expect(find.text('post 0'), findsNothing);
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets(
      'settings page: a swipe from the middle goes back, a vertical '
      'scroll still scrolls', (tester) async {
    await _open(
      tester,
      Scaffold(
        body: ListView(
          children: [
            for (var i = 0; i < 40; i++)
              ListTile(title: Text('setting $i'), onTap: () {}),
          ],
        ),
      ),
    );
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    expect(find.text('setting 0'), findsNothing);
    await _swipeRight(tester, middle, 300);
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets(
      'attorney profile with a carousel: the carousel keeps its '
      'swipe, the rest of the screen goes back', (tester) async {
    final carousel = ScrollController();
    await _open(
      tester,
      Scaffold(
        body: Column(
          children: [
            SizedBox(
              height: 120,
              child: ListView(
                controller: carousel,
                scrollDirection: Axis.horizontal,
                children: [
                  for (var i = 0; i < 10; i++)
                    SizedBox(width: 160, child: Text('card $i')),
                ],
              ),
            ),
            const Expanded(child: SizedBox.expand()),
          ],
        ),
      ),
    );
    // Over the carousel: it scrolls, the screen stays.
    await tester.drag(find.text('card 1'), const Offset(-200, 0));
    await tester.pumpAndSettle();
    expect(carousel.offset, greaterThan(0));
    await _swipeRight(tester, const Offset(200, 60), 120);
    expect(find.text('open'), findsNothing);
    // Below it: back.
    await _swipeRight(tester, middle, 300);
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets(
      'tabs on a pushed screen: the first tab hands a right swipe to '
      'back, the second tab swipes to the first', (tester) async {
    var tab = 'a';
    await _open(
      tester,
      StatefulBuilder(
        builder: (context, set) => Scaffold(
          body: SwipePages<String>(
            value: tab,
            values: const ['a', 'b'],
            onChanged: (v) => set(() => tab = v),
            pageBuilder: (_, v) => Center(child: Text('page-$v')),
          ),
        ),
      ),
    );
    // Left: next tab.
    await _swipeRight(tester, middle, -300);
    expect(tab, 'b');
    // Right on the second tab: the first tab, still on the screen.
    await _swipeRight(tester, middle, 300);
    expect(tab, 'a');
    expect(find.text('page-a'), findsOneWidget);
    // Right on the first tab: back.
    await _swipeRight(tester, middle, 300);
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets('a mouse never goes back (web, desktop)', (tester) async {
    await _open(tester, const Scaffold(body: SizedBox.expand()));
    final g = await tester.startGesture(
      middle,
      kind: PointerDeviceKind.mouse,
    );
    await g.moveBy(const Offset(300, 0));
    await g.up();
    await tester.pumpAndSettle();
    expect(find.text('open'), findsNothing);
  });

  testWidgets(
      'chat rows: the row edge pins, the middle of the screen goes '
      'back (BackSwipeMode.rows)', (tester) async {
    var pinned = 0;
    await _open(
      tester,
      BackSwipe(
        mode: BackSwipeMode.rows,
        child: Scaffold(
          body: ListView(
            children: [
              ChatSwipe(
                id: 'c1',
                pinned: false,
                muted: false,
                onPin: () => pinned++,
                onMute: () {},
                child: const SizedBox(
                  height: 72,
                  width: double.infinity,
                  child: Text('chat one'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    // From the row's leading edge: the row's action.
    await tester.dragFrom(const Offset(10, 36), const Offset(200, 0));
    await tester.pumpAndSettle();
    expect(pinned, 1);
    expect(find.text('chat one'), findsOneWidget);
    // From the middle of the row: not the row's — back.
    expect(kEdgeSwipeZone, lessThan(100));
    await _swipeRight(tester, const Offset(200, 36), 300);
    expect(pinned, 1);
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets('BackSwipeMode.edge: the middle never goes back, the edge does',
      (tester) async {
    await _open(
      tester,
      const BackSwipe(
        mode: BackSwipeMode.edge,
        child: Scaffold(body: SizedBox.expand(child: Text('keep'))),
      ),
    );
    await _swipeRight(tester, middle, 300);
    expect(find.text('keep'), findsOneWidget);
    await _swipeRight(tester, const Offset(4, 400), 300);
    expect(find.text('open'), findsOneWidget);
  });
}
