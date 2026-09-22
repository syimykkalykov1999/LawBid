import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Non-golden animation-behavior tests required by file 07 §9: the gavel
/// doesn't show under `disableAnimations`, repeated taps mid-animation are
/// ignored, and unmounting mid-animation doesn't throw / leaks no
/// AnimationController.
void main() {
  Widget wrap(Widget child, {bool disableAnimations = false}) {
    return MaterialApp(
      theme: AppTheme.light(),
      home: MediaQuery(
        data: MediaQueryData(disableAnimations: disableAnimations),
        child: Scaffold(body: Center(child: child)),
      ),
    );
  }

  testWidgets('fires onPressed immediately when disableAnimations is set', (tester) async {
    var pressed = 0;
    await tester.pumpWidget(
      wrap(
        GavelStrikeButton(label: 'Подтвердить', onPressed: () => pressed++),
        disableAnimations: true,
      ),
    );

    await tester.tap(find.byType(GavelStrikeButton));
    await tester.pump();

    expect(pressed, 1); // no 700ms delay needed — fired synchronously.
  });

  testWidgets('ignores repeated taps while the strike animation is running', (tester) async {
    var pressed = 0;
    await tester.pumpWidget(
      wrap(GavelStrikeButton(label: 'Подтвердить', onPressed: () => pressed++)),
    );

    await tester.tap(find.byType(GavelStrikeButton));
    await tester.pump(const Duration(milliseconds: 100));
    // Second tap arrives mid-animation — must be ignored.
    await tester.tap(find.byType(GavelStrikeButton));
    await tester.pump(const Duration(milliseconds: 700));

    expect(pressed, 1);
  });

  testWidgets('fires onPressed once ~700ms after a normal tap', (tester) async {
    var pressed = 0;
    await tester.pumpWidget(
      wrap(GavelStrikeButton(label: 'Подтвердить', onPressed: () => pressed++)),
    );

    await tester.tap(find.byType(GavelStrikeButton));
    await tester.pump(const Duration(milliseconds: 699));
    expect(pressed, 0);
    await tester.pump(const Duration(milliseconds: 5));
    expect(pressed, 1);
  });

  testWidgets('disposes cleanly when unmounted mid-animation', (tester) async {
    await tester.pumpWidget(
      wrap(GavelStrikeButton(label: 'Подтвердить', onPressed: () {})),
    );
    await tester.tap(find.byType(GavelStrikeButton));
    await tester.pump(const Duration(milliseconds: 200));

    // Unmount while the strike animation + pending action Timer are live.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 700));

    expect(tester.takeException(), isNull);
  });
}
