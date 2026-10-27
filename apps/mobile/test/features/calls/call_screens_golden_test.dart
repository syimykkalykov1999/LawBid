import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';

import '../../helpers/ux_harness.dart';
import 'call_screen_fakes.dart';

/// Owner 2026-10-26 (calls rework, docs/dev/calls-rework/REFERENCE.md): the
/// call screens as pictures — outgoing, incoming, 1:1 voice, 1:1 video,
/// group grid of three, one of three big — on a 390 × 844 phone, in the
/// Day and Night themes. Files: `goldens/call_<screen>_<theme>.png`.
void main() {
  final cases = <String, (CallSession, CallVideoLayout)>{
    'outgoing': (callSession1to1(CallPhase.outgoing), const CallVideoLayout()),
    'incoming_video': (
      callSession1to1(CallPhase.incoming, video: true),
      const CallVideoLayout(),
    ),
    'audio': (callSession1to1(CallPhase.active), const CallVideoLayout()),
    'video_1to1': (
      callSession1to1(CallPhase.active, video: true),
      const CallVideoLayout(),
    ),
    'grid_3': (callSessionGroup(3, video: true), const CallVideoLayout()),
    'grid_4': (callSessionGroup(4, video: true), const CallVideoLayout()),
    'grid_5': (callSessionGroup(5, video: true), const CallVideoLayout()),
    'grid_7': (callSessionGroup(7, video: true), const CallVideoLayout()),
    'grid_4_controls_hidden': (
      callSessionGroup(4, video: true),
      const CallVideoLayout(controlsHidden: true),
    ),
    'audio_group_5': (callSessionGroup(5), const CallVideoLayout()),
    'focused_3': (
      callSessionGroup(3, video: true),
      const CallVideoLayout(focusId: 'u1'),
    ),
  };
  for (final theme in [AppThemeId.values.first, AppThemeId.values[1]]) {
    for (final MapEntry(key: name, value: (s, layout)) in cases.entries) {
      testWidgets('call screen: $name (${theme.name})', (tester) async {
        tester.view
          ..physicalSize = const Size(390, 844) * 3
          ..devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              ...uxOverrides(),
              ...callScreenFakeOverrides(s, layout: layout),
            ],
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: AppTheme.of(theme),
              home: const CallScreen(),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 800));
        await expectLater(
          find.byType(CallScreen),
          matchesGoldenFile('goldens/call_${name}_${theme.name}.png'),
        );
        // Let the screen's timers go.
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(seconds: 5));
      });
    }
  }
}
