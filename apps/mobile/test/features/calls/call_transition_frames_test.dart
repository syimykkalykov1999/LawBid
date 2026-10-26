import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';

import '../../helpers/ux_harness.dart';
import 'call_screen_fakes.dart';

/// Owner 2026-10-26: frames of the grid → one person big → back to the grid
/// change, for the PR's short video (docs/dev/calls-rework/
/// grid-focus.gif). Runs only on demand:
/// `CALL_FRAMES=1 flutter test --update-goldens <this file>`.
void main() {
  final skip = Platform.environment['CALL_FRAMES'] != '1';
  testWidgets('grid ↔ focused transition frames', skip: skip, (tester) async {
    tester.view
      ..physicalSize = const Size(390, 844) * 2
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          ...callScreenFakeOverrides(callSessionGroup(5, video: true)),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.of(AppThemeId.values.first),
          home: const CallScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));
    var n = 0;
    Future<void> shot() => expectLater(
          find.byType(CallScreen),
          matchesGoldenFile('frames/f_${(n++).toString().padLeft(3, '0')}.png'),
        );
    for (var i = 0; i < 8; i++) {
      await shot();
    }
    for (final id in ['u3', 'u1', 'u1']) {
      await tester.tap(find.byKey(Key('call-tile-$id')));
      await tester.pump();
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 40));
        await shot();
      }
      for (var i = 0; i < 10; i++) {
        await shot();
      }
    }
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  });
}
