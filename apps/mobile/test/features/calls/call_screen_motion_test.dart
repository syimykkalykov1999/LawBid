import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_controls.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

import '../../helpers/ux_harness.dart';
import 'call_screen_fakes.dart';

/// Calls audit 2026-10-26, group M2 (UI-02 … UI-07, AN-1, UI-13, T7): the
/// call screen's motion and layout guards.
void main() {
  Future<ProviderContainer> open(
    WidgetTester tester,
    CallSession s, {
    CallVideoLayout layout = const CallVideoLayout(),
    DateTime Function()? clock,
  }) async {
    tester.view
      ..physicalSize = const Size(390, 844) * 3
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    CountingSurface.reset();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          ...callScreenFakeOverrides(
            s,
            layout: layout,
            surface: CountingSurface.surface,
            clock: clock,
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: const CallScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    return ProviderScope.containerOf(tester.element(find.byType(CallScreen)));
  }

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  }

  testWidgets(
      'UI-02: grid → one person big → grid keeps every renderer (no new '
      'one, none thrown away)', (tester) async {
    final c = await open(tester, callSessionGroup(4, video: true));
    // u2's camera is off: three pictures.
    expect(CountingSurface.mounted, 3);
    final layout = c.read(callVideoLayoutProvider.notifier);
    for (var i = 0; i < 2; i++) {
      layout.toggleFocus('u1');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.read(callVideoLayoutProvider).focusId, 'u1');
      layout.toggleFocus('u1');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.read(callVideoLayoutProvider).focusId, isNull);
    }
    // A card in the strip made big, then back.
    layout
      ..toggleFocus('u1')
      ..setMain('u3');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(CountingSurface.mounted, 3);
    expect(CountingSurface.disposed, 0);
    expect(tester.takeException(), isNull);
    await close(tester);
  });

  testWidgets(
      'UI-03: the 1:1 swap moves the two renderers between the full screen '
      'and the small card — neither is made anew', (tester) async {
    final c = await open(
      tester,
      callSession1to1(CallPhase.active, video: true),
    );
    expect(CountingSurface.mounted, 2);
    for (var i = 0; i < 2; i++) {
      c.read(callVideoLayoutProvider.notifier).swap();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }
    c.read(callVideoLayoutProvider.notifier).swap();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.read(callVideoLayoutProvider).selfBig, isTrue);
    expect(CountingSurface.mounted, 2);
    expect(CountingSurface.disposed, 0);
    expect(find.byKey(const ValueKey('shown-me')), findsOneWidget);
    expect(find.byKey(const ValueKey('shown-them')), findsOneWidget);
    expect(tester.takeException(), isNull);
    await close(tester);
  });

  testWidgets(
      'UI-04: a video call hides its controls after 4 s untouched; a tap '
      'brings them back; the small picture stays', (tester) async {
    final c = await open(
      tester,
      callSession1to1(CallPhase.active, video: true),
    );
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    await tester.pump(const Duration(seconds: 3));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    await tester.pump(const Duration(seconds: 1, milliseconds: 100));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isTrue);
    await tester.pump(const Duration(milliseconds: 400));
    // The self picture stays on screen while the controls are away.
    expect(find.byKey(const Key('call-pip-swap')), findsOneWidget);

    await tester.tapAt(const Offset(195, 420));
    await tester.pump();
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    // A touch starts the 4 s again.
    await tester.pump(const Duration(seconds: 2));
    await tester.tapAt(const Offset(195, 300));
    await tester.pump();
    // That second tap hid them (one tap = show / hide) …
    expect(c.read(callVideoLayoutProvider).controlsHidden, isTrue);
    await tester.tapAt(const Offset(195, 300));
    await tester.pump();
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    await tester.pump(const Duration(seconds: 3));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    await tester.pump(const Duration(seconds: 1, milliseconds: 100));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isTrue);
    expect(find.byKey(const Key('call-pip-swap')), findsOneWidget);
    await close(tester);
  });

  testWidgets('UI-04: a voice call never hides its controls', (tester) async {
    final c = await open(tester, callSession1to1(CallPhase.active));
    await tester.pump(const Duration(seconds: 10));
    await tester.tapAt(const Offset(195, 420));
    await tester.pump(const Duration(seconds: 10));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    expect(find.byType(CallControlSheet), findsOneWidget);
    await close(tester);
  });

  testWidgets(
      'UI-05: the small picture never covers the top buttons and rests '
      'above the control sheet', (tester) async {
    await open(tester, callSession1to1(CallPhase.active, video: true));
    final pip = tester.getRect(find.byKey(const Key('call-pip-swap')));
    final add = tester.getRect(find.byKey(const Key('call-btn-add')));
    final sheet = tester.getRect(find.byType(CallControlSheet));
    expect(pip.overlaps(add), isFalse, reason: 'pip $pip vs + $add');
    expect(pip.top, greaterThanOrEqualTo(add.bottom));
    expect(pip.bottom, lessThanOrEqualTo(sheet.top));
    await close(tester);
  });

  testWidgets(
      'UI-06: scrims under the top line and the sheet only while a picture '
      'is live', (tester) async {
    await open(tester, callSession1to1(CallPhase.active, video: true));
    expect(find.byKey(const Key('call-scrim-top')), findsOneWidget);
    expect(find.byKey(const Key('call-scrim-bottom')), findsOneWidget);
    await close(tester);
    await open(tester, callSession1to1(CallPhase.active));
    expect(find.byKey(const Key('call-scrim-top')), findsNothing);
    await close(tester);
  });

  testWidgets(
      'UI-07 / T7: the timer reads the call clock and ticks by itself; an '
      'active call schedules no frames between ticks (no endless pulse)',
      (tester) async {
    var now = callScreenNow;
    await open(
      tester,
      callSession1to1(CallPhase.active),
      clock: () => now,
    );
    expect(find.text('1:29'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    // Nothing animates while the call just runs.
    expect(tester.binding.hasScheduledFrame, isFalse);
    now = now.add(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('1:31'), findsOneWidget);
    await close(tester);
  });

  testWidgets('UI-07: the rings pulse while it rings', (tester) async {
    await open(tester, callSession1to1(CallPhase.outgoing));
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.binding.hasScheduledFrame, isTrue);
    await close(tester);
  });

  testWidgets(
      'AN-1 / UI-09: a voice call draws the blurred photo behind the big '
      'one; without a photo only the initials', (tester) async {
    await open(tester, callSession1to1(CallPhase.active));
    expect(find.byType(ImageFiltered), findsNothing);
    await close(tester);

    const withPhoto = CallPeer(
      id: 'u1',
      isAttorney: true,
      displayName: 'Amelia Hart',
      avatarUrl: 'https://cdn.example.test/a.jpg',
    );
    final s = callSession1to1(CallPhase.active).copyWith(peer: withPhoto);
    await open(tester, s);
    expect(
      find.descendant(
        of: find.byType(CallPhotoBackdrop),
        matching: find.byType(ImageFiltered),
      ),
      findsOneWidget,
    );
    await close(tester);
  });
}
