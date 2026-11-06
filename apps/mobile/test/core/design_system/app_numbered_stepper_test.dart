import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-11-05: every step flow shows the attorney wizard's numbered
/// stepper; the bars are gone.
void main() {
  Widget host(Widget child, {TextDirection direction = TextDirection.ltr}) =>
      MaterialApp(
        theme: AppTheme.light(),
        home: Directionality(
          textDirection: direction,
          child: Scaffold(body: child),
        ),
      );

  testWidgets('AppStepProgress shows numbers, not segments', (tester) async {
    await tester.pumpWidget(
      host(
        const AppStepProgress(total: 4, current: 2, semanticLabel: 'Step 2'),
      ),
    );
    await tester.pumpAndSettle();
    // Step 1 is a check; 2, 3 and 4 show their numbers.
    expect(find.text('1'), findsNothing);
    for (final n in ['2', '3', '4']) {
      expect(find.text(n), findsOneWidget);
    }
    expect(find.bySemanticsLabel('Step 2'), findsOneWidget);
  });

  testWidgets('the rail fits 6 steps in 200 pt without an overflow',
      (tester) async {
    await tester.pumpWidget(
      host(
        const Center(
          child: SizedBox(
            width: 200,
            child: AppNumberedStepRail(count: 6, current: 2),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('6'), findsOneWidget);
  });

  testWidgets('right-to-left: step 1 sits on the right', (tester) async {
    await tester.pumpWidget(
      host(
        const AppNumberedStepRail(count: 3, current: 0),
        direction: TextDirection.rtl,
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.getCenter(find.text('1')).dx,
      greaterThan(tester.getCenter(find.text('3')).dx),
    );
  });

  testWidgets('done steps are tappable only when asked for', (tester) async {
    final tapped = <int>[];
    await tester.pumpWidget(
      host(
        AppNumberedStepRail(count: 3, current: 1, onTapStep: tapped.add),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('3'));
    expect(tapped, isEmpty);
    await tester.tap(find.byType(AppIcon).first);
    expect(tapped, [0]);
  });
}
