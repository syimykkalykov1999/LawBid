import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/features/chat/presentation/reply_swipe.dart';
import 'package:material_ui/material_ui.dart';

/// Owner 2026-10-22 (Telegram): a message is quoted by dragging it toward
/// the start; the screen still goes back by a drag toward the end, even
/// when the finger lands on a bubble (docs/ux/GESTURES.md).
Future<void> _open(WidgetTester tester, List<int> log) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light().copyWith(
        pageTransitionsTheme: kBackSwipeTransitions,
      ),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => Scaffold(
                    body: ListView(
                      children: [
                        for (var i = 0; i < 12; i++)
                          SwipeToReply(
                            onReply: () => log.add(i),
                            child: SizedBox(
                              height: 60,
                              child: Align(
                                alignment: AlignmentDirectional.centerEnd,
                                child: Text('message $i'),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

Future<void> _drag(WidgetTester tester, Offset from, double dx) async {
  final g = await tester.startGesture(from);
  for (var i = 0; i < 10; i++) {
    await g.moveBy(Offset(dx / 10, 0.5));
    await tester.pump(const Duration(milliseconds: 16));
  }
  await g.up();
  await tester.pumpAndSettle();
}

Future<void> _single(
  WidgetTester tester, {
  required VoidCallback onReply,
  Widget? child,
}) =>
    tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SwipeToReply(
            onReply: onReply,
            child: child ?? const SizedBox(height: 60, child: Text('hello')),
          ),
        ),
      ),
    );

class _BuildCounter extends StatelessWidget {
  const _BuildCounter(this.builds);
  final List<int> builds;
  @override
  Widget build(BuildContext context) {
    builds.add(1);
    return const SizedBox(height: 60, child: Text('hello'));
  }
}

void main() {
  // Owner row 89 (2026-11-16): «как у WhatsApp/Telegram».
  group('row 89: feels like WhatsApp/Telegram', () {
    testWidgets('64 dp of finger quotes, a shorter pull does not',
        (tester) async {
      var replies = 0;
      await _single(tester, onReply: () => replies++);
      final at = tester.getCenter(find.text('hello'));
      await _drag(tester, at, -(SwipeToReply.trigger - 14));
      expect(replies, 0, reason: '50 dp is under the line');
      await _drag(tester, at, -(SwipeToReply.trigger + 6));
      expect(replies, 1, reason: '70 dp is past the line');
    });

    testWidgets('the bubble follows the finger 1:1 up to the line',
        (tester) async {
      await _single(tester, onReply: () {});
      final home = tester.getTopLeft(find.text('hello')).dx;
      final g = await tester.startGesture(tester.getCenter(find.text('hello')));
      for (var i = 0; i < 4; i++) {
        await g.moveBy(const Offset(-10, 0));
        await tester.pump(const Duration(milliseconds: 8));
      }
      // Counted from the touch-down: the touch slop is not lost.
      expect(tester.getTopLeft(find.text('hello')).dx, home - 40);
      await g.up();
      await tester.pumpAndSettle();
    });

    testWidgets('one light haptic at the line, not one per frame',
        (tester) async {
      final buzz = <Object?>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'HapticFeedback.vibrate') buzz.add(call.arguments);
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null),
      );
      var replies = 0;
      await _single(tester, onReply: () => replies++);
      final g = await tester.startGesture(tester.getCenter(find.text('hello')));
      // Far past the line, in many frames (120 Hz-like steps).
      for (var i = 0; i < 40; i++) {
        await g.moveBy(const Offset(-4, 0));
        await tester.pump(const Duration(milliseconds: 8));
      }
      await g.up();
      await tester.pumpAndSettle();
      expect(buzz, ['HapticFeedbackType.lightImpact']);
      expect(replies, 1);
    });

    testWidgets('let go: the arrow shows, then the bubble springs home',
        (tester) async {
      await _single(tester, onReply: () {});
      final home = tester.getTopLeft(find.text('hello'));
      final g = await tester.startGesture(tester.getCenter(find.text('hello')));
      for (var i = 0; i < 10; i++) {
        await g.moveBy(const Offset(-9, 0));
        await tester.pump(const Duration(milliseconds: 16));
      }
      expect(find.byKey(const ValueKey('reply-swipe-arrow')), findsOneWidget);
      final pulled = tester.getTopLeft(find.text('hello')).dx;
      expect(pulled, lessThan(home.dx - SwipeToReply.trigger));
      // Never farther than the rubber band's end.
      expect(pulled, greaterThanOrEqualTo(home.dx - SwipeToReply.maxTravel));
      await g.up();
      // The spring's first frame starts it; the second moves it.
      await tester.pump(const Duration(milliseconds: 16));
      await tester.pump(const Duration(milliseconds: 16));
      final next = tester.getTopLeft(find.text('hello')).dx;
      // A glide, not a jump: on its way home but not there yet.
      expect(next, greaterThan(pulled));
      expect(next, lessThan(home.dx));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(find.text('hello')), home);
      expect(find.byKey(const ValueKey('reply-swipe-arrow')), findsNothing);
    });

    testWidgets('a drag does not rebuild the bubble', (tester) async {
      final builds = <int>[];
      await _single(tester, onReply: () {}, child: _BuildCounter(builds));
      expect(builds, hasLength(1));
      await _drag(tester, tester.getCenter(find.text('hello')), -120);
      expect(builds, hasLength(1));
    });

    testWidgets('a mostly vertical drag scrolls the list, never quotes',
        (tester) async {
      final log = <int>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: ListView(
              children: [
                for (var i = 0; i < 30; i++)
                  SwipeToReply(
                    onReply: () => log.add(i),
                    child: SizedBox(height: 60, child: Text('message $i')),
                  ),
              ],
            ),
          ),
        ),
      );
      final x0 = tester.getTopLeft(find.text('message 6')).dx;
      final y0 = tester.getTopLeft(find.text('message 6')).dy;
      final g =
          await tester.startGesture(tester.getCenter(find.text('message 6')));
      // Up and a little toward the start, as a thumb scrolls.
      for (var i = 0; i < 10; i++) {
        await g.moveBy(const Offset(-6, -20));
        await tester.pump(const Duration(milliseconds: 16));
      }
      expect(tester.getTopLeft(find.text('message 6')).dx, x0);
      expect(tester.getTopLeft(find.text('message 6')).dy, lessThan(y0 - 100));
      await g.up();
      await tester.pumpAndSettle();
      expect(log, isEmpty);
    });
  });

  testWidgets('a drag toward the start past the threshold quotes the message',
      (tester) async {
    var replies = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SwipeToReply(
            onReply: () => replies++,
            child: const SizedBox(height: 60, child: Text('hello')),
          ),
        ),
      ),
    );
    await _drag(tester, tester.getCenter(find.text('hello')), -120);
    expect(replies, 1);
    // A short pull does nothing.
    await _drag(tester, tester.getCenter(find.text('hello')), -30);
    expect(replies, 1);
  });

  testWidgets('RTL mirrors it: toward the right quotes', (tester) async {
    var replies = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: SwipeToReply(
              onReply: () => replies++,
              child: const SizedBox(height: 60, child: Text('hello')),
            ),
          ),
        ),
      ),
    );
    await _drag(tester, tester.getCenter(find.text('hello')), -120);
    expect(replies, 0);
    await _drag(tester, tester.getCenter(find.text('hello')), 120);
    expect(replies, 1);
  });

  testWidgets('a drag toward the end from a bubble goes back, no quote',
      (tester) async {
    final log = <int>[];
    await _open(tester, log);
    expect(find.text('message 0'), findsOneWidget);
    await _drag(tester, const Offset(300, 30), 300);
    expect(find.text('message 0'), findsNothing);
    expect(find.text('open'), findsOneWidget);
    expect(log, isEmpty);
  });

  testWidgets('on the open chat a drag toward the start only quotes',
      (tester) async {
    final log = <int>[];
    await _open(tester, log);
    await _drag(tester, const Offset(300, 30), -150);
    expect(find.text('message 0'), findsOneWidget);
    expect(log, [0]);
  });

  // Owner row 90 (2026-11-13): swipe a message → the reply bar opens → ✕
  // → a plain tap on a message opened «reply» again.
  testWidgets('a tap after a swipe reply never quotes again (row 90)',
      (tester) async {
    final log = <int>[];
    await _open(tester, log);
    await _drag(tester, const Offset(300, 30), -150);
    expect(log, [0]);
    // ✕ on the reply bar clears the quote; the bubble is a plain bubble.
    log.clear();
    await tester.tap(find.text('message 0'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('message 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('message 0'));
    await tester.pumpAndSettle();
    expect(log, isEmpty);
  });

  // Owner row 89: pulled past the line and back under it, letting go does
  // not quote; the bubble glides back to its place.
  testWidgets('pulled back under the line: no quote, bubble back home',
      (tester) async {
    var replies = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SwipeToReply(
            onReply: () => replies++,
            child: const SizedBox(height: 60, child: Text('hello')),
          ),
        ),
      ),
    );
    final home = tester.getTopLeft(find.text('hello'));
    final g = await tester.startGesture(tester.getCenter(find.text('hello')));
    for (var i = 0; i < 10; i++) {
      await g.moveBy(const Offset(-12, 0.5));
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(tester.getTopLeft(find.text('hello')).dx, lessThan(home.dx - 40));
    for (var i = 0; i < 4; i++) {
      await g.moveBy(const Offset(10, 0));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
    await tester.pump(const Duration(milliseconds: 16));
    // Still on its way back on the next frame (a glide, not a jump) …
    expect(tester.getTopLeft(find.text('hello')).dx, lessThan(home.dx));
    await tester.pumpAndSettle();
    // … and home once settled.
    expect(tester.getTopLeft(find.text('hello')), home);
    expect(replies, 0);
  });
}
