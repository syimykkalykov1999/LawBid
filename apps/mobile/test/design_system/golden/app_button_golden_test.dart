import 'package:flutter/material.dart';
import 'package:golden_toolkit/golden_toolkit.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Golden coverage for AppButton (file 07 §D.1 acceptance: golden tests of
/// base widgets in both themes, incl. loading state per file 07 §9).
void main() {
  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness == Brightness.light ? 'light' : 'dark';
    final theme = brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

    testGoldens('AppButton default - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        const Padding(
          padding: EdgeInsets.all(16),
          child: AppButton(label: 'Получить код', onPressed: _noop),
        ),
        wrapper: materialAppWrapper(theme: theme),
        surfaceSize: const Size(320, 100),
      );
      await screenMatchesGolden(tester, 'app_button_default_$name');
    });

    testGoldens('AppButton loading - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        const Padding(
          padding: EdgeInsets.all(16),
          child: AppButton(label: 'Получить код', onPressed: _noop, isLoading: true),
        ),
        wrapper: materialAppWrapper(theme: theme),
        surfaceSize: const Size(320, 100),
      );
      // Indeterminate CircularProgressIndicator animates forever - the
      // default internal pumpAndSettle() never settles against it, so pump
      // a single fixed frame instead (see file-level note in this test).
      await screenMatchesGolden(
        tester,
        'app_button_loading_$name',
        customPump: (tester) => tester.pump(const Duration(milliseconds: 100)),
      );
    });
  }
}

void _noop() {}
