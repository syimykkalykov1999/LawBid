import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';
import 'package:lawbid/features/verification/presentation/widgets/id_selfie_capture_view.dart';

/// Owner 2026-10-28 (ID selfie camera): the guided view without a camera —
/// overlay, localized instruction and live hint, shutter disabled until
/// face + liveness, «Take photo anyway» after the timeout, no gallery.
void main() {
  const t = StaticTranslatorEn();

  SelfieLivenessView view({
    SelfieHint hint = SelfieHint.noFace,
    bool canCapture = false,
    bool showFallback = false,
    OvalTone tone = OvalTone.neutral,
  }) =>
      SelfieLivenessView(
        hint: hint,
        tone: tone,
        challenge: LivenessChallenge.blink,
        challengeDone: canCapture,
        faceInOval: canCapture,
        cardDetected: false,
        canCapture: canCapture,
        showFallback: showFallback,
        holdProgress: 0,
      );

  // The example animation loops forever, so no pumpAndSettle: one frame
  // to start the implicit animations, one past their end.
  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<({List<String> taps, ValueNotifier<SelfieLivenessView> v})> pump(
    WidgetTester tester, {
    SelfieLivenessView? initial,
    bool manual = false,
    bool disableAnimations = false,
    Uint8List? shot,
  }) async {
    tester.view.physicalSize = const Size(390, 844) * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final taps = <String>[];
    final v = ValueNotifier(initial ?? view());
    addTearDown(v.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: MediaQuery(
          data: MediaQueryData(
            size: const Size(390, 844),
            disableAnimations: disableAnimations,
          ),
          child: Scaffold(
            body: IdSelfieCaptureView(
              t: t,
              preview: const ColoredBox(color: Color(0x00000000)),
              view: v,
              manual: manual,
              busy: false,
              shot: shot,
              onShutter: () => taps.add('shutter'),
              onAnyway: () => taps.add('anyway'),
              onClose: () => taps.add('close'),
              onRetake: () => taps.add('retake'),
              onUse: () => taps.add('use'),
            ),
          ),
        ),
      ),
    );
    await settle(tester);
    return (taps: taps, v: v);
  }

  testWidgets('overlay, instruction, example and live hint render',
      (tester) async {
    await pump(tester);
    expect(find.byKey(const ValueKey('id-selfie-overlay')), findsOneWidget);
    expect(find.text('Hold your ID next to your face'), findsOneWidget);
    expect(find.text('Show your face in the oval'), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        'Example: a person holding an ID card next to their face',
      ),
      findsOneWidget,
    );
    // The selfie comes from the camera only: no gallery or file option.
    expect(find.text('Photo library'), findsNothing);
    expect(find.text('Photo or PDF'), findsNothing);
  });

  testWidgets('shutter is disabled until face + liveness, then enabled',
      (tester) async {
    final r = await pump(tester, initial: view(hint: SelfieHint.blink));
    expect(find.text('Blink'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('id-selfie-shutter')));
    await tester.pump();
    expect(r.taps, isEmpty);

    r.v.value = view(
      hint: SelfieHint.holdStill,
      canCapture: true,
      tone: OvalTone.ready,
    );
    await settle(tester);
    expect(find.text('Hold still…'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('id-selfie-shutter')));
    await tester.pump();
    expect(r.taps, ['shutter']);
  });

  testWidgets('«Take photo anyway» appears only after the timeout',
      (tester) async {
    final r = await pump(tester, initial: view(hint: SelfieHint.moveCloser));
    expect(find.text('Move closer'), findsOneWidget);
    expect(find.text('Take photo anyway'), findsNothing);
    r.v.value = view(hint: SelfieHint.moveCloser, showFallback: true);
    await settle(tester);
    expect(find.text('Take photo anyway'), findsOneWidget);
    await tester.tap(find.text('Take photo anyway'));
    await tester.pump();
    expect(r.taps, ['anyway']);
  });

  testWidgets('no detector: manual hint and the shutter works at once',
      (tester) async {
    final r = await pump(tester, manual: true, disableAnimations: true);
    expect(
      find.text(
        'Put your face in the oval and your ID in the frame, '
        'then take the photo',
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('id-selfie-shutter')));
    await tester.pump();
    expect(r.taps, ['shutter']);
  });

  testWidgets('review: Retake / Use', (tester) async {
    final png = Uint8List.fromList(const [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49,
      0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1F, 0x15,
      0xC4, 0x89, 0, 0, 0, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63,
      0, 1, 0, 0, 5, 0, 1, 0x0D, 0x0A, 0x2D, 0xB4, 0, 0, 0, 0, 0x49, 0x45,
      0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82, //
    ]);
    final r = await pump(tester, shot: png);
    expect(find.byKey(const ValueKey('id-selfie-shutter')), findsNothing);
    await tester.tap(find.text('Retake'));
    await tester.tap(find.text('Use photo'));
    await tester.pump();
    expect(r.taps, ['retake', 'use']);
  });
}
