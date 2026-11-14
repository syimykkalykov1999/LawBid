import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner row 88 (2026-11-13): a sheet whose body scrolls follows the
/// finger once the list is pulled past its top, and on release closes from
/// where it is or glides back.
Future<void> _open(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => showAppBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => SizedBox(
                  height: 500,
                  child: ListView(
                    children: [
                      for (var i = 0; i < 30; i++)
                        SizedBox(height: 48, child: Text('row $i')),
                    ],
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

Future<TestGesture> _pull(WidgetTester tester, double dy) async {
  final g = await tester.startGesture(tester.getCenter(find.text('row 2')));
  for (var i = 0; i < 10; i++) {
    await g.moveBy(Offset(0, dy / 10));
    await tester.pump(const Duration(milliseconds: 50));
  }
  return g;
}

void main() {
  testWidgets('a short pull moves the sheet with the finger, then back',
      (tester) async {
    await _open(tester);
    final top = tester.getTopLeft(find.text('row 0')).dy;
    final g = await _pull(tester, 50);
    // The rows did not scroll; the whole sheet went down with the finger.
    final moved = tester.getTopLeft(find.text('row 0')).dy - top;
    expect(moved, greaterThan(20));
    await g.up();
    await tester.pumpAndSettle();
    expect(find.text('row 0'), findsOneWidget);
    expect(tester.getTopLeft(find.text('row 0')).dy, moreOrLessEquals(top));
  },
      variant: const TargetPlatformVariant({
        TargetPlatform.android,
        TargetPlatform.iOS,
      }),
  );

  testWidgets('a long pull closes the sheet', (tester) async {
    await _open(tester);
    final g = await _pull(tester, 220);
    await g.up();
    await tester.pumpAndSettle();
    expect(find.text('row 0'), findsNothing);
  },
      variant: const TargetPlatformVariant({
        TargetPlatform.android,
        TargetPlatform.iOS,
      }),
  );
}
