import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-19: a message from a bottom sheet (e.g. a payment that
/// can't start) is seen above the sheet, never hidden under it.
void main() {
  testWidgets('from a tall sheet the message shows on top', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (sheet) => SizedBox(
                  height: 560,
                  child: TextButton(
                    onPressed: () => showAppSnackBar(sheet, 'Payment failed'),
                    child: const Text('pay'),
                  ),
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('pay'));
    await tester.pump();
    final message = find.byKey(const ValueKey('app-overlay-message'));
    expect(message, findsOneWidget);
    expect(find.text('Payment failed'), findsOneWidget);
    // On top: a tap on it reaches the message, not the sheet.
    final hit = tester.hitTestOnBinding(tester.getCenter(message));
    expect(
      hit.path.any(
        (e) => e.target == tester.renderObject(find.text('Payment failed')),
      ),
      isTrue,
    );
    await tester.pump(const Duration(seconds: 5));
    expect(message, findsNothing);
  });

  testWidgets('on a plain screen it stays a snackbar', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showAppSnackBar(context, 'Saved'),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('go'));
    await tester.pump();
    expect(find.byType(SnackBar), findsOneWidget);
  });
}
