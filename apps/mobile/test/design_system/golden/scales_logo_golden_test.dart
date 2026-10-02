import 'package:flutter/material.dart';
import 'package:golden_toolkit/golden_toolkit.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Golden coverage for the static ScalesLogo pose (file 07 §D.1 acceptance).
/// The animated pose is NOT golden-tested (animation timing makes a single
/// frame non-deterministic to pin down by hand) — covered instead by the
/// widget test in scales_logo_test.dart (disableAnimations / dispose safety).
void main() {
  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness == Brightness.light ? 'light' : 'dark';
    final theme =
        brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

    testGoldens('ScalesLogo static - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        const ScalesLogo(size: 160),
        wrapper: materialAppWrapper(theme: theme),
        surfaceSize: const Size(200, 140),
      );
      await screenMatchesGolden(tester, 'scales_logo_static_$name');
    });
  }
}
