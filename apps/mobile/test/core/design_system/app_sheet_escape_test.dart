import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

import '../../helpers/ux_harness.dart';

/// Audit 26.10 W6: Esc closes every bottom sheet with a keyboard (a narrow
/// web window, a tablet with a keyboard) — not only the desktop window.
void main() {
  tearDown(() => adaptiveShellOverride = null);

  for (final size in const [Size(390, 844), Size(800, 1000)]) {
    for (final handleOnly in const [false, true]) {
      testWidgets(
          'Esc closes the sheet at ${size.width.toInt()} '
          '(closeByHandleOnly: $handleOnly)', (t) async {
        t.view.physicalSize = size;
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.reset);
        adaptiveShellOverride = true;
        await t.pumpWidget(
          uxApp(
            Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => showAppBottomSheet<void>(
                    context: context,
                    closeByHandleOnly: handleOnly,
                    builder: (_) => const Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [AppSheetHandle(), Text('sheet body')],
                    ),
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
            theme: AppTheme.light(),
            size: size,
            overrides: uxOverrides(),
          ),
        );
        await t.tap(find.text('open'));
        await t.pumpAndSettle();
        expect(find.byType(BottomSheet), findsOneWidget);
        await t.sendKeyEvent(LogicalKeyboardKey.escape);
        await t.pumpAndSettle();
        expect(find.text('sheet body'), findsNothing);
      });
    }
  }
}
