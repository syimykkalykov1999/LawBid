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

  testWidgets('a sheet opens over the content column on a wide window',
      (t) async {
    t.view.physicalSize = const Size(1400, 900);
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
        size: const Size(1400, 900),
        overrides: uxOverrides(),
      ),
    );
    unawaited(
      showAppBottomSheet<void>(
        context: ctx,
        builder: (_) => const SizedBox(
            width: double.infinity, height: 200, key: Key('sheet-body')),
      ),
    );
    await t.pumpAndSettle();
    final r = t.getRect(find.byKey(const Key('sheet-body')));
    // Column: 220 + (1180 - 680) / 2 = 470 .. 1150.
    expect(r.left, closeTo(470, 1));
    expect(r.right, closeTo(1150, 1));
  });
}
