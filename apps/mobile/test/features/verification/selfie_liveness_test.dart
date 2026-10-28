import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';

/// Owner 2026-10-28 (ID selfie camera): the liveness state machine with
/// fake detector input — forgiving placement, one prompt, soft card gate,
/// ~1 s auto-capture, «Take photo anyway» after the timeout.
void main() {
  Duration ms(int v) => Duration(milliseconds: v);

  /// A face box centred at ([cx], [cy]) with height [h] (normalized).
  FaceSample face({
    double cx = 0.36,
    double cy = 0.40,
    double h = 0.28,
    double? eyes = 0.9,
    double? yaw = 0,
  }) =>
      FaceSample(
        box: Rect.fromCenter(center: Offset(cx, cy), width: h * 0.8, height: h),
        leftEyeOpen: eyes,
        rightEyeOpen: eyes,
        yaw: yaw,
      );

  FrameSignals one(FaceSample f, {bool? card, double? light}) =>
      FrameSignals(faces: [f], cardText: card, brightness: light);

  group('placement hints (forgiving)', () {
    final m = SelfieLivenessMachine(
      challenge: LivenessChallenge.blink,
    );

    test('no face / two faces / dark', () {
      expect(
        m.add(const FrameSignals(faces: []), ms(0)).hint,
        SelfieHint.noFace,
      );
      expect(
        m.add(FrameSignals(faces: [face(), face(cx: 0.7)]), ms(100)).hint,
        SelfieHint.multipleFaces,
      );
      expect(
        m.add(const FrameSignals(faces: [], brightness: 20), ms(200)).hint,
        SelfieHint.moreLight,
      );
    });

    test('too small / too big / off centre; 20 % off is still fine', () {
      expect(m.add(one(face(h: 0.08)), ms(300)).hint, SelfieHint.moveCloser);
      expect(m.add(one(face(h: 0.5)), ms(400)).hint, SelfieHint.moveBack);
      expect(
        m.add(one(face(cx: 0.36 + 0.5 * 0.3)), ms(500)).hint,
        SelfieHint.centerFace,
      );
      final ok = m.add(one(face(cx: 0.36 + 0.5 * 0.2, h: 0.18)), ms(600));
      expect(ok.faceInOval, isTrue);
      expect(ok.tone, OvalTone.active);
      expect(ok.hint, SelfieHint.blink);
    });
  });

  test('capture is disabled until face + liveness; blink passes', () {
    final m = SelfieLivenessMachine(
      challenge: LivenessChallenge.blink,
    );
    // Closed eyes before they were seen open do not count.
    var v = m.add(one(face(eyes: 0.1), card: true), ms(0));
    expect(v.canCapture, isFalse);
    expect(v.hint, SelfieHint.blink);
    v = m.add(one(face()), ms(150));
    expect(v.challengeDone, isFalse);
    v = m.add(one(face(eyes: 0.2)), ms(300));
    expect(v.canCapture, isFalse);
    v = m.add(one(face(eyes: 0.95)), ms(450));
    expect(v.challengeDone, isTrue);
    expect(v.canCapture, isTrue);
    // Card already seen → green at once, hold still for the auto-capture.
    expect(v.tone, OvalTone.ready);
    expect(v.hint, SelfieHint.holdStill);
    expect(m.cardDetected, isTrue);
    // No classification → the blink can't be judged (stays waiting).
    final n = SelfieLivenessMachine(
      challenge: LivenessChallenge.blink,
    );
    expect(n.add(one(face(eyes: null)), ms(0)).challengeDone, isFalse);
  });

  test('head turn passes either way and returns to the camera', () {
    final m = SelfieLivenessMachine(
      challenge: LivenessChallenge.turnLeft,
    );
    expect(m.add(one(face()), ms(0)).hint, SelfieHint.turnLeft);
    expect(m.add(one(face(yaw: 12)), ms(150)).challengeDone, isFalse);
    // The mirrored platform reports the other sign: still accepted.
    expect(m.add(one(face(yaw: -25)), ms(300)).challengeDone, isFalse);
    expect(m.turnMatched, isFalse);
    final v = m.add(one(face(yaw: -4)), ms(450));
    expect(v.challengeDone, isTrue);
    expect(v.canCapture, isTrue);
  });

  test('auto-capture ~0.9 s after everything holds; a break resets it', () {
    final m = SelfieLivenessMachine(
      challenge: LivenessChallenge.turnRight,
    );
    var v = (m
          ..add(one(face(), card: true), ms(0))
          ..add(one(face(yaw: -30)), ms(150)))
        .add(one(face(yaw: 2)), ms(300));
    expect(v.tone, OvalTone.ready);
    expect(v.holdProgress, 0);
    v = m.add(one(face()), ms(750));
    expect(v.holdProgress, closeTo(0.5, 0.01));
    expect(v.autoCaptureDue, isFalse);
    // Face leaves the oval: the hold starts over.
    v = m.add(const FrameSignals(faces: []), ms(800));
    expect(v.holdProgress, 0);
    expect(v.tone, OvalTone.neutral);
    m.add(one(face()), ms(900));
    expect(m.tick(ms(1700)).autoCaptureDue, isFalse);
    expect(m.tick(ms(1800)).autoCaptureDue, isTrue);
  });

  group('fallback timers', () {
    test('no card text: «show your ID» until 4 s, then allowed anyway', () {
      final m = SelfieLivenessMachine(
        challenge: LivenessChallenge.blink,
      );
      var v = (m
            ..add(one(face()), ms(0))
            ..add(one(face(eyes: 0.1)), ms(200)))
          .add(one(face()), ms(400));
      expect(v.canCapture, isTrue);
      expect(v.hint, SelfieHint.showId);
      expect(v.tone, OvalTone.active);
      v = m.add(one(face()), ms(3990));
      expect(v.hint, SelfieHint.showId);
      v = m.add(one(face()), ms(4000));
      expect(v.tone, OvalTone.ready);
      expect(v.hint, SelfieHint.holdStill);
      expect(m.tick(ms(4900)).autoCaptureDue, isTrue);
      expect(m.cardDetected, isFalse);
    });

    test('«Take photo anyway» appears after 9 s, without any frame', () {
      final m = SelfieLivenessMachine(
        challenge: LivenessChallenge.blink,
      );
      expect(m.tick(ms(8999)).showFallback, isFalse);
      expect(m.tick(ms(9000)).showFallback, isTrue);
      expect(m.view.canCapture, isFalse);
    });

    test('a typical attempt captures well under 10 s', () {
      final m = SelfieLivenessMachine(
        challenge: LivenessChallenge.blink,
      );
      var t = 0;
      SelfieLivenessView v;
      // 1.5 s to frame the face, a blink, the card seen at 3 s.
      do {
        t += 150;
        final eyes = (t > 2000 && t < 2300) ? 0.1 : 0.9;
        v = m.add(
          one(face(cx: t < 1500 ? 0.7 : 0.37, eyes: eyes), card: t >= 3000),
          ms(t),
        );
      } while (!v.autoCaptureDue && t < 20000);
      expect(t, lessThan(5000));
      expect(v.showFallback, isFalse);
    });
  });

  test('the guide layout keeps the oval and card on screen, side by side', () {
    const layout = SelfieGuideLayout(Size(390, 844));
    final o = layout.oval;
    final c = layout.card;
    expect(o.left, greaterThan(0));
    expect(c.left, greaterThan(o.right));
    expect(c.right, lessThan(390));
    expect(c.width / c.height, closeTo(1.586, 0.01));
    final cfg = layout.config();
    expect(cfg.ovalCenter.dx, closeTo(0.36, 0.001));
    expect(cfg.ovalWidth, closeTo(0.5, 0.001));
  });

  test('the random prompt is one of the three', () {
    final seen = {
      for (var i = 0; i < 60; i++) LivenessChallenge.random(),
    };
    expect(seen, containsAll(LivenessChallenge.values));
  });
}
