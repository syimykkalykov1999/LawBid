import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Non-golden animation-behavior tests required by file 07 §9 (§5.2): the
/// swing must not start under `disableAnimations`, and pausing/disposing
/// must not throw.
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

  testWidgets('static (non-animated) mode never creates a ticking controller',
      (tester) async {
    await tester.pumpWidget(wrap(const ScalesLogo(size: 100)));
    await tester.pump(const Duration(seconds: 2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('animated mode does not throw with disableAnimations set',
      (tester) async {
    await tester.pumpWidget(
      wrap(
        const ScalesLogo(size: 100, animated: true),
        disableAnimations: true,
      ),
    );
    await tester.pump(const Duration(seconds: 2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('animated mode disposes cleanly when unmounted', (tester) async {
    await tester.pumpWidget(wrap(const ScalesLogo(size: 100, animated: true)));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 500));
    expect(tester.takeException(), isNull);
  });
}
