import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/features/chat/presentation/reply_swipe.dart';

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

void main() {
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
}
