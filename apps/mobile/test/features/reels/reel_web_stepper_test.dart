import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/reels/presentation/reel_web_stepper.dart';

/// Row 193 (instagram.com/reels, tiktok.com): on the website the wheel,
/// the trackpad and the arrow keys page the reels one at a time.
void main() {
  tearDown(() => ReelWebStepper.debugAssumeWeb = false);

  late PageController pages;

  Future<void> pump(
    WidgetTester tester, {
    bool web = true,
    ValueListenable<bool>? shown,
  }) async {
    ReelWebStepper.debugAssumeWeb = web;
    pages = PageController();
    addTearDown(pages.dispose);
    final stepper = ReelWebStepper(pages);
    await tester.pumpWidget(
      MaterialApp(
        home: ValueListenableBuilder<bool>(
          valueListenable: shown ?? ValueNotifier(true),
          builder: (_, on, child) => TickerMode(enabled: on, child: child!),
          child: ReelWebPager(
            stepper: stepper,
            child: PageView.builder(
              controller: pages,
              physics: stepper.physics,
              scrollDirection: Axis.vertical,
              itemCount: 10,
              itemBuilder: (_, i) => ReelWheelTarget(
                stepper: stepper,
                child: ColoredBox(
                  color: Colors.black,
                  child: Center(child: Text('reel $i')),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  int page() => pages.page!.round();

  /// One wheel event over the middle of the reel at [ms].
  Future<void> wheel(WidgetTester tester, double dy, int ms) async {
    tester.binding.handlePointerEvent(
      PointerScrollEvent(
        position: tester.getCenter(find.byType(PageView)),
        scrollDelta: Offset(0, dy),
        timeStamp: Duration(milliseconds: ms),
        kind: PointerDeviceKind.trackpad,
      ),
    );
    await tester.pump(const Duration(milliseconds: 16));
  }

  testWidgets('one mouse wheel notch is one reel, a notch up goes back',
      (tester) async {
    await pump(tester);
    await wheel(tester, 100, 0);
    await tester.pumpAndSettle();
    expect(page(), 1);
    expect(pages.page, 1.0, reason: 'it rests on the reel, not between');

    await wheel(tester, 100, 1000);
    await tester.pumpAndSettle();
    expect(page(), 2);

    await wheel(tester, -100, 2000);
    await tester.pumpAndSettle();
    expect(page(), 1);
  });

  testWidgets('a trackpad swipe with its inertia tail is one reel',
      (tester) async {
    await pump(tester);
    // A Mac trackpad swipe: deltas rise, then a long shrinking tail,
    // an event every 16 ms for about a second.
    final deltas = <double>[
      2, 6, 14, 28, 44, 52, 50, 46, //
      for (var d = 42.0; d > 1; d *= 0.92) d,
    ];
    var ms = 0;
    for (final d in deltas) {
      await wheel(tester, d, ms);
      ms += 16;
    }
    await tester.pumpAndSettle();
    expect(page(), 1, reason: 'no double jumps');

    // A second swipe after a pause is the next reel.
    ms += 600;
    for (final d in deltas) {
      await wheel(tester, d, ms);
      ms += 16;
    }
    await tester.pumpAndSettle();
    expect(page(), 2);
  });

  testWidgets('a fast-spun wheel moves one reel, not many', (tester) async {
    await pump(tester);
    for (var i = 0; i < 12; i++) {
      await wheel(tester, 100, i * 40);
    }
    await tester.pumpAndSettle();
    expect(page(), 1);
  });

  testWidgets('arrow keys and Page Up / Down step one reel', (tester) async {
    await pump(tester);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(page(), 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.pageDown);
    await tester.pumpAndSettle();
    expect(page(), 2);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.pumpAndSettle();
    expect(page(), 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.pumpAndSettle();
    expect(page(), 0, reason: 'a second press during the slide is ignored');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.pumpAndSettle();
    expect(page(), 0, reason: 'nothing above the first reel');
  });

  // Final pass 18.11 (FA5): the feed keeps the Reels page alive beside
  // Posts with its tickers off; the arrow keys there must not page it.
  testWidgets('the keys page the reels only while their page is shown',
      (tester) async {
    final shown = ValueNotifier(true);
    addTearDown(shown.dispose);
    await pump(tester, shown: shown);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(page(), 1);

    shown.value = false; // Posts slid in.
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(page(), 1, reason: 'the hidden reels stay where they were');

    shown.value = true; // Back on Reels: where it was, the keys work.
    await tester.pumpAndSettle();
    expect(page(), 1, reason: 'no step was waiting behind the page');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(page(), 2);
  });

  testWidgets('on a phone the pager is as it was', (tester) async {
    await pump(tester, web: false);
    expect(find.byType(Listener).evaluate().length, isNonZero);
    expect(
      find.descendant(
        of: find.byType(PageView),
        matching: find.byWidgetPredicate(
          (w) =>
              w is Listener &&
              w.onPointerSignal != null &&
              w.behavior == HitTestBehavior.translucent,
        ),
      ),
      findsNothing,
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(page(), 0);
  });
}
