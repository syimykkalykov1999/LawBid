import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

import '../../helpers/ux_harness.dart';

void main() {
  test('column bounds: phone none, tablet rail, laptop centred column', () {
    expect(contentColumnBounds(390, adaptive: true).maxWidth, isNull);
    expect(contentColumnBounds(700, adaptive: true).maxWidth, 624);
    final b = contentColumnBounds(1400, adaptive: true);
    expect((b.shift, b.maxWidth), (110.0, 680.0));
    expect(contentColumnBounds(1400, adaptive: false).maxWidth, isNull);
  });

  // Desktop web plan 2026-10-28: from 1024 a sheet is a window in the
  // middle (desktop_foundation_test); a 1000 window keeps the sheet.
  testWidgets('a sheet opens over the content column on a wide window',
      (t) async {
    t.view.physicalSize = const Size(1000, 900);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    adaptiveShellOverride = true;
    addTearDown(() => adaptiveShellOverride = null);
    late BuildContext ctx;
    await t.pumpWidget(
      uxApp(
        Builder(
          builder: (c) {
            ctx = c;
            return const Scaffold();
          },
        ),
        theme: AppTheme.dark(),
        size: const Size(1000, 900),
        overrides: uxOverrides(),
      ),
    );
    unawaited(
      showAppBottomSheet<void>(
        context: ctx,
        builder: (_) => const SizedBox(
          width: double.infinity,
          height: 200,
          key: Key('sheet-body'),
        ),
      ),
    );
    await t.pumpAndSettle();
    final r = t.getRect(find.byKey(const Key('sheet-body')));
    // Column: 220 + (780 - 680) / 2 = 270 .. 950.
    expect(r.left, closeTo(270, 1));
    expect(r.right, closeTo(950, 1));
  });
}
