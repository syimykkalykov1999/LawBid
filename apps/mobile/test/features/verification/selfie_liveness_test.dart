import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';

/// Owner 2026-10-28 (ID selfie camera) + 2026-11-12 (row 62): the liveness
/// state machine with fake detector input — a guide that follows the face
/// (any arm length), hysteresis on presence and on every border, debounced
/// hints, one prompt, soft card gate, auto-capture only when steady,
/// «Take photo anyway» after the timeout.
void main() {
  Duration ms(int v) => Duration(milliseconds: v);
  const aspect = 844 / 390;

  /// A face box centred at ([cx], [cy]) whose width is [w] of the screen
  /// width (a roughly square box in pixels).
  FaceSample face({
    double cx = 0.36,
    double cy = 0.40,
    double w = 0.30,
    double? eyes = 0.9,
    double? yaw = 0,
  }) =>
      FaceSample(
        box: Rect.fromCenter(
          center: Offset(cx, cy),
          width: w,
          height: w * 1.15 / aspect,
        ),
        leftEyeOpen: eyes,
        rightEyeOpen: eyes,
        yaw: yaw,
      );

  FrameSignals one(FaceSample f, {bool? card, double? light}) =>
      FrameSignals(faces: [f], cardText: card, brightness: light);

  /// [n] frames of [f], 150 ms apart from [from]; returns the last view.
  SelfieLivenessView feed(
    SelfieLivenessMachine m,
    FaceSample f, {
    required int from,
    int n = 6,
    bool? card,
  }) {
    late SelfieLivenessView v;
    for (var i = 0; i < n; i++) {
      v = m.add(one(f, card: card), ms(from + i * 150));
    }
    return v;
  }

  SelfieLivenessMachine machine([
    LivenessChallenge c = LivenessChallenge.blink,
  ]) =>
      SelfieLivenessMachine(challenge: c);

  group('presence is stable (no flicker)', () {
    test('no face / dark', () {
      final m = machine();
      expect(m.view.hint, SelfieHint.starting);
      expect(
        m.add(const FrameSignals(faces: []), ms(0)).hint,
        SelfieHint.noFace,
      );
      expect(m.view.hint, SelfieHint.noFace);
      m.add(const FrameSignals(faces: [], brightness: 20), ms(400));
      expect(
        m.add(const FrameSignals(faces: [], brightness: 20), ms(750)).hint,
        SelfieHint.moreLight,
      );
    });

    test('one missed frame keeps the face; a long gap drops it', () {
      final m = machine();
      var v = feed(m, face(), from: 0, n: 3);
      expect(v.tone, OvalTone.active);
      expect(v.guide, isNotNull);
      final guide = v.guide;
      // ML Kit misses a frame: nothing on screen changes.
      v = m.add(const FrameSignals(faces: []), ms(450));
      expect(v.tone, OvalTone.active);
      expect(v.hint, SelfieHint.blink);
      expect(v.guide, guide);
      // Back next frame: still the same guide.
      v = m.add(one(face()), ms(600));
      expect(v.faceInOval, isTrue);
      // Gone for longer than 0.6 s: neutral, rest layout.
      m.add(const FrameSignals(faces: []), ms(750));
      v = m.tick(ms(1300));
      expect(v.tone, OvalTone.neutral);
      expect(v.guide, isNull);
      expect(m.tick(ms(1700)).hint, SelfieHint.noFace);
    });

    test('two real faces need two frames; the ID photo is ignored', () {
      final m = machine();
      feed(m, face(), from: 0, n: 2);
      // The small face on the card the attorney holds.
      final card = face(cx: 0.75, cy: 0.48, w: 0.08);
      var v = m.add(FrameSignals(faces: [face(), card]), ms(300));
      expect(v.faceInOval, isTrue);
      v = m.add(FrameSignals(faces: [face(), card]), ms(450));
      expect(v.hint, isNot(SelfieHint.multipleFaces));
      // A second person: one frame is not enough …
      final other = face(cx: 0.75, w: 0.25);
      v = m.add(FrameSignals(faces: [face(), other]), ms(600));
      expect(v.faceInOval, isTrue);
      // … two in a row are.
      m.add(FrameSignals(faces: [face(), other]), ms(750));
      v = m.add(FrameSignals(faces: [face(), other]), ms(1100));
      expect(v.hint, SelfieHint.multipleFaces);
      expect(v.faceInOval, isFalse);
    });

    test('a one-frame hint change never reaches the screen', () {
      final m = machine();
      expect(feed(m, face(), from: 0, n: 3).hint, SelfieHint.blink);
      // One frame far off (a detector glitch, not averaged away yet).
      final v = m.add(one(face(cy: 0.95)), ms(450));
      expect(v.hint, SelfieHint.blink);
    });
  });

  group('distance and centre from the face box (any arm length)', () {
    test('too small → closer, too big → back, off-centre → centre', () {
      expect(
        feed(machine(), face(w: 0.12), from: 0).hint,
        SelfieHint.moveCloser,
      );
      expect(
        feed(machine(), face(cx: 0.5, w: 0.6), from: 0).hint,
        SelfieHint.moveBack,
      );
      expect(
        feed(machine(), face(cy: 0.85), from: 0).hint,
        SelfieHint.centerFace,
      );
      expect(
        feed(machine(), face(cx: 0.05, w: 0.24), from: 0).hint,
        SelfieHint.centerFace,
      );
    });

    test('near and far both work: the guide is placed around the face', () {
      for (final w in [0.24, 0.30, 0.40]) {
        final v = feed(machine(), face(w: w), from: 0);
        expect(v.faceInOval, isTrue, reason: 'face width $w');
        expect(v.hint, SelfieHint.blink);
      }
    });

    test('hysteresis: once in place, a little smaller is still fine', () {
      // In place at 0.30, then drifts to 0.205 (under the 0.22 border,
      // inside the 0.03 slack): no «move closer».
      final m = machine();
      feed(m, face(), from: 0);
      final v = feed(m, face(w: 0.205), from: 900, n: 8);
      expect(v.faceInOval, isTrue);
      // Coming from too far, 0.205 is not enough yet.
      expect(
        feed(machine(), face(w: 0.205), from: 0).hint,
        SelfieHint.moveCloser,
      );
      // Well beyond the slack: «move closer».
      expect(
        feed(m, face(w: 0.15), from: 2100, n: 8).hint,
        SelfieHint.moveCloser,
      );
    });

    test('the oval grows with the face and follows it', () {
      final near = feed(machine(), face(w: 0.40), from: 0).guide!;
      final far = feed(machine(), face(w: 0.24), from: 0).guide!;
      expect(near.oval.width, greaterThan(far.oval.width));
      final moved = feed(machine(), face(cx: 0.62, w: 0.26), from: 0).guide!;
      expect(moved.oval.center.dx, closeTo(0.62, 0.001));
      // Little room on the right: the card frame goes left of the face.
      expect(moved.cardOnRight, isFalse);
      expect(moved.card.right, lessThan(moved.oval.left));
    });

    test('dead band: a tiny move does not redraw the guide', () {
      final m = machine();
      final g = feed(m, face(), from: 0).guide;
      final v = m.add(one(face(cx: 0.362)), ms(1000));
      expect(v.guide, same(g));
    });
  });

  group('liveness prompt', () {
    test('capture is disabled until face + liveness; blink passes', () {
      final m = machine();
      // Closed eyes before they were seen open do not count.
      var v = m.add(one(face(eyes: 0.1), card: true), ms(0));
      expect(v.canCapture, isFalse);
      expect(v.hint, SelfieHint.blink);
      v = m.add(one(face()), ms(150));
      expect(v.challengeDone, isFalse);
      v = m.add(one(face(eyes: 0.2)), ms(300));
      expect(v.canCapture, isFalse);
      v = m.add(one(face(eyes: 0.95), card: true), ms(450));
      expect(v.challengeDone, isTrue);
      expect(v.canCapture, isTrue);
      expect(m.cardDetected, isTrue);
      // No classification → the blink can't be judged (stays waiting).
      expect(
        machine().add(one(face(eyes: null)), ms(0)).challengeDone,
        isFalse,
      );
    });

    test('head turn passes either way and returns to the camera', () {
      final m = machine(LivenessChallenge.turnLeft);
      expect(m.add(one(face()), ms(0)).hint, SelfieHint.turnLeft);
      expect(m.add(one(face(yaw: 12)), ms(150)).challengeDone, isFalse);
      // The mirrored platform reports the other sign: still accepted.
      expect(m.add(one(face(yaw: -25)), ms(300)).challengeDone, isFalse);
      expect(m.turnMatched, isFalse);
      final v = m.add(one(face(yaw: -4)), ms(450));
      expect(v.challengeDone, isTrue);
      expect(v.canCapture, isTrue);
    });
  });

  group('auto-capture only when face + card are in place and steady', () {
    /// Face in place, blink done, card seen: at [t] ms.
    SelfieLivenessMachine readyAt(int t) => machine()
      ..add(one(face(), card: true), ms(t))
      ..add(one(face(eyes: 0.1), card: true), ms(t + 150))
      ..add(one(face(), card: true), ms(t + 300));

    test('steady for 0.7 s → capture; moving → «hold steady», reset', () {
      final m = readyAt(0);
      // Ready (and steady) since the blink at 300 ms.
      var v = m.add(one(face(), card: true), ms(450));
      expect(v.tone, OvalTone.ready);
      expect(v.hint, SelfieHint.holdStill);
      v = m.add(one(face(), card: true), ms(650));
      expect(v.holdProgress, closeTo(0.5, 0.01));
      expect(v.autoCaptureDue, isFalse);
      // The phone shakes: the face jumps 20 % of its width per frame.
      v = m.add(one(face(cx: 0.42), card: true), ms(700));
      expect(v.holdProgress, 0);
      expect(v.tone, isNot(OvalTone.ready));
      v = m.add(one(face(cx: 0.48), card: true), ms(1000));
      expect(v.hint, SelfieHint.holdSteady);
      // Still again: a new 0.7 s hold from 1150 ms.
      v = m.add(one(face(cx: 0.48), card: true), ms(1150));
      expect(v.tone, OvalTone.ready);
      v = m.add(one(face(cx: 0.48), card: true), ms(1500));
      expect(m.tick(ms(1840)).autoCaptureDue, isFalse);
      expect(m.tick(ms(1850)).autoCaptureDue, isTrue);
    });

    test('the card frame is green only while the card is seen', () {
      final m = readyAt(0);
      expect(m.view.cardDetected, isTrue);
      // No card text for longer than 1.8 s (and before the 5 s soft gate).
      var v = feed(m, face(), from: 450, n: 16);
      expect(v.cardDetected, isFalse);
      expect(v.hint, SelfieHint.showId);
      expect(v.canCapture, isTrue);
      expect(v.holdProgress, 0);
      // The verifier's flag keeps «seen once».
      expect(m.cardDetected, isTrue);
      v = m.add(one(face(), card: true), ms(2850));
      expect(v.cardDetected, isTrue);
    });

    test('no card text at all: «show your ID» until 5 s, then allowed', () {
      final m = machine()
        ..add(one(face()), ms(0))
        ..add(one(face(eyes: 0.1)), ms(150))
        ..add(one(face()), ms(300));
      var v = feed(m, face(), from: 450, n: 20);
      expect(v.hint, SelfieHint.showId);
      expect(v.tone, OvalTone.active);
      v = feed(m, face(), from: 3450, n: 12);
      expect(v.tone, OvalTone.ready);
      expect(v.hint, SelfieHint.holdStill);
      expect(v.autoCaptureDue, isFalse);
      expect(feed(m, face(), from: 5250, n: 5).autoCaptureDue, isTrue);
      expect(m.cardDetected, isFalse);
    });

    test('«Take photo anyway» appears after 9 s, without any frame', () {
      final m = machine();
      expect(m.tick(ms(8999)).showFallback, isFalse);
      expect(m.tick(ms(9000)).showFallback, isTrue);
      expect(m.view.canCapture, isFalse);
    });

    test('a typical attempt captures well under 10 s', () {
      final m = machine();
      var t = 0;
      SelfieLivenessView v;
      // 1.5 s too far, then framed; a blink; the card raised at 2.5 s.
      do {
        t += 150;
        final eyes = (t > 2000 && t < 2300) ? 0.1 : 0.9;
        v = m.add(
          one(face(w: t < 1500 ? 0.14 : 0.30, eyes: eyes), card: t >= 2500),
          ms(t),
        );
      } while (!v.autoCaptureDue && t < 20000);
      expect(t, lessThan(4500));
      expect(v.showFallback, isFalse);
    });
  });

  group('guide geometry', () {
    test('rest layout = the previous fixed spots (look unchanged)', () {
      const layout = SelfieGuideLayout(Size(390, 844));
      final o = layout.oval;
      final c = layout.card;
      expect(o.center.dx, closeTo(390 * 0.36, 0.01));
      expect(o.width, closeTo(390 * 0.5, 0.01));
      expect(o.height / o.width, closeTo(1.3, 0.01));
      expect(c.left, greaterThan(o.right));
      expect(c.right, lessThan(390));
      expect(c.width / c.height, closeTo(85.6 / 54, 0.01));
    });

    test('around a face: card on screen, ID-1 shape, beside the oval', () {
      const geo = SelfieGuideGeometry();
      const screen = Size(390, 844);
      for (final cx in [0.2, 0.35, 0.5, 0.65, 0.8]) {
        for (final w in [0.22, 0.30, 0.40]) {
          final p = geo.around(face(cx: cx, w: w).box);
          final c = p.guide.cardOn(screen);
          expect(c.left, greaterThanOrEqualTo(0), reason: '$cx $w');
          expect(c.right, lessThanOrEqualTo(390.01), reason: '$cx $w');
          expect(c.width / c.height, closeTo(85.6 / 54, 0.01));
          final o = p.guide.ovalOn(screen);
          expect(o.height / o.width, closeTo(1.3, 0.01));
        }
      }
    });

    test('the card side does not ping-pong near the middle', () {
      const geo = SelfieGuideGeometry();
      final mid = face(cx: 0.52).box;
      expect(geo.around(mid, preferRight: true).guide.cardOnRight, isTrue);
      expect(geo.around(mid, preferRight: false).guide.cardOnRight, isFalse);
      // Clearly more room on the other side: it switches.
      expect(
        geo.around(face(cx: 0.75).box, preferRight: true).guide.cardOnRight,
        isFalse,
      );
    });

    test('Debounced shows a value only after the dwell', () {
      final d = Debounced(1, dwell: ms(300));
      expect(d.update(2, ms(0)), 1);
      expect(d.update(2, ms(299)), 1);
      expect(d.update(2, ms(300)), 2);
      // A blip back and forth never shows.
      expect(d.update(3, ms(400)), 2);
      expect(d.update(2, ms(500)), 2);
      expect(d.update(3, ms(900)), 2);
      expect(d.update(9, ms(950), immediate: true), 9);
    });
  });

  test('the random prompt is one of the three', () {
    final seen = {
      for (var i = 0; i < 60; i++) LivenessChallenge.random(),
    };
    expect(seen, containsAll(LivenessChallenge.values));
  });
}
