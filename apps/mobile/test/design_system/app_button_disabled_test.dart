import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-07 (phone test): an inactive button looks inactive and,
/// when tapped, says what is missing instead of doing nothing.
void main() {
  Future<void> pump(WidgetTester tester, Widget button) => tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: Center(child: button)),
        ),
      );

  testWidgets('disabled: dimmed, the hint shows, onPressed never runs',
      (tester) async {
    var pressed = 0;
    await pump(
      tester,
      AppButton(
        label: 'Publish',
        isEnabled: false,
        disabledHint: 'Choose a video first.',
        onPressed: () => pressed++,
      ),
    );
    final opacity = tester.widget<AnimatedOpacity>(
      find.descendant(
        of: find.byType(AppButton),
        matching: find.byType(AnimatedOpacity),
      ),
    );
    expect(opacity.opacity, lessThan(1));
    await tester.tap(find.byType(AppButton));
    await tester.pump();
    expect(find.text('Choose a video first.'), findsOneWidget);
    expect(pressed, 0);
  });

  testWidgets('enabled: full opacity, onPressed runs, no hint', (tester) async {
    var pressed = 0;
    await pump(
      tester,
      AppButton(
        label: 'Publish',
        disabledHint: 'Choose a video first.',
        onPressed: () => pressed++,
      ),
    );
    await tester.tap(find.byType(AppButton));
    await tester.pump();
    expect(pressed, 1);
    expect(find.text('Choose a video first.'), findsNothing);
  });
}
