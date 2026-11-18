import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/compact_case_row.dart';

/// Owner row 190 (2026-11-17, flutter_slidable / Mail / WhatsApp): a case
/// row swiped open closes by itself — when another row opens, when the
/// list scrolls, on a tap elsewhere, and when the swipe is interrupted.
final taps = <int>[];

Widget _list() => MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: Column(
          children: [
            const SizedBox(height: 80, child: Center(child: Text('header'))),
            Expanded(
              child: ListView(
                children: [
                  for (var i = 0; i < 30; i++)
                    SwipeActions(
                      actions: [
                        SwipeAction(
                          label: 'Delete',
                          icon: Icons.delete,
                          color: Colors.red,
                          onColor: Colors.white,
                          onTap: () {},
                        ),
                      ],
                      child: Material(
                        child: InkWell(
                          onTap: () => taps.add(i),
                          child: SizedBox(
                            height: 72,
                            child: Center(child: Text('row $i')),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );

double _shift(WidgetTester tester, int i) =>
    tester.getCenter(find.text('row $i')).dx -
    tester.getCenter(find.text('header')).dx;

Future<void> _open(WidgetTester tester, int i) async {
  await tester.drag(find.text('row $i'), const Offset(-200, 0));
  await tester.pumpAndSettle();
  expect(_shift(tester, i), lessThan(-50), reason: 'row $i is open');
}

void main() {
  setUp(taps.clear);

  testWidgets('opening another row closes the open one', (tester) async {
    await tester.pumpWidget(_list());
    await _open(tester, 0);
    await _open(tester, 2);
    expect(_shift(tester, 0), 0, reason: 'row 0 closed by itself');
  });

  testWidgets('a scroll closes the open row', (tester) async {
    await tester.pumpWidget(_list());
    await _open(tester, 1);
    await tester.drag(find.text('row 4'), const Offset(0, -60));
    await tester.pumpAndSettle();
    expect(_shift(tester, 1), 0);
  });

  testWidgets('a tap elsewhere closes the open row and opens nothing', (
    tester,
  ) async {
    await tester.pumpWidget(_list());
    await _open(tester, 0);
    await tester.tap(find.text('row 3'));
    await tester.pumpAndSettle();
    expect(_shift(tester, 0), 0);
    expect(taps, isEmpty, reason: 'the tap only closed the swipe');

    await _open(tester, 0);
    await tester.tap(find.text('header'));
    await tester.pumpAndSettle();
    expect(_shift(tester, 0), 0);

    // With nothing open a tap opens the row as before.
    await tester.tap(find.text('row 3'));
    await tester.pumpAndSettle();
    expect(taps, [3]);
  });

  testWidgets('an interrupted swipe leaves the row closed', (tester) async {
    await tester.pumpWidget(_list());
    final g = await tester.startGesture(tester.getCenter(find.text('row 0')));
    for (var i = 0; i < 6; i++) {
      await g.moveBy(const Offset(-12, 0));
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(_shift(tester, 0), lessThan(0), reason: 'the row follows');
    await g.cancel();
    await tester.pumpAndSettle();
    expect(_shift(tester, 0), 0);
  });
}
