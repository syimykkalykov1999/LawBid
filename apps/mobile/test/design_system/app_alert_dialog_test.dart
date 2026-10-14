import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

Future<void> _open(WidgetTester tester, TextDirection d) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(
        textDirection: d,
        child: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => AppAlertDialog(
                  title: const Text('Title'),
                  content: const Text('Body text'),
                  actions: [
                    TextButton(onPressed: () {}, child: const Text('Cancel')),
                    FilledButton(
                      onPressed: () {},
                      child: const Text('Continue and sign out there'),
                    ),
                  ],
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

void main() {
  for (final d in [TextDirection.ltr, TextDirection.rtl]) {
    testWidgets('dialog buttons are centred, full width, stacked ($d)',
        (tester) async {
      await _open(tester, d);
      final dialog = tester.getRect(find.byType(AlertDialog));
      final a = tester.getRect(find.widgetWithText(TextButton, 'Cancel'));
      final b = tester.getRect(find.byType(FilledButton));
      expect(a.width, closeTo(b.width, 0.5));
      expect(a.center.dx, closeTo(dialog.center.dx, 0.5));
      expect(b.center.dx, closeTo(dialog.center.dx, 0.5));
      expect(b.top, greaterThan(a.bottom - 1));
      expect(a.width, greaterThan(dialog.width * 0.65));
    });
  }
}
