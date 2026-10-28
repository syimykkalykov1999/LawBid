import 'dart:async';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/verification/application/detection_throttle.dart';
import 'package:lawbid/features/verification/application/selfie_capture_session.dart';
import 'package:lawbid/features/verification/data/selfie_frame_detector.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';

/// Owner 2026-10-28 (ID selfie camera, "never freeze"): detection runs on
/// a throttled stream — one detection in flight, extra frames dropped,
/// interval adapting to the detector's speed; a detector error falls back
/// to the manual shot.
void main() {
  Duration ms(int v) => Duration(milliseconds: v);

  group('DetectionThrottle', () {
    test('30 fps stream, fast detector: about every 5th frame', () {
      final th = DetectionThrottle();
      for (var i = 0; i < 30; i++) {
        final now = ms(i * 33);
        if (th.offer(now)) th.done(ms(20));
      }
      expect(th.offered, 30);
      // 1 s / 150 ms → 7 detections at most.
      expect(th.processed, inInclusiveRange(6, 7));
      expect(th.droppedBusy, 0);
    });

    test('a busy detector drops frames instead of queueing them', () {
      final th = DetectionThrottle();
      expect(th.offer(ms(0)), isTrue);
      for (var i = 1; i < 10; i++) {
        expect(th.offer(ms(i * 33)), isFalse);
      }
      expect(th.droppedBusy, 9);
      th.done(ms(330));
      // Slow phone: the interval follows latency × 1.5 (capped).
      expect(th.interval, ms(495));
      expect(th.offer(ms(400)), isFalse);
      expect(th.offer(ms(500)), isTrue);
      th.done(ms(2000));
      expect(th.interval, th.maxInterval);
      th.done(ms(10));
      expect(th.interval, th.minInterval);
    });

    test('text recognition: ~once a second, only until a card is seen', () {
      expect(
        DetectionThrottle.textDue(now: ms(0), lastText: null, cardSeen: false),
        isTrue,
      );
      expect(
        DetectionThrottle.textDue(
          now: ms(500),
          lastText: ms(0),
          cardSeen: false,
        ),
        isFalse,
      );
      expect(
        DetectionThrottle.textDue(
          now: ms(900),
          lastText: ms(0),
          cardSeen: false,
        ),
        isTrue,
      );
      expect(
        DetectionThrottle.textDue(now: ms(900), lastText: null, cardSeen: true),
        isFalse,
      );
    });
  });

  group('SelfieCaptureSession', () {
    test(
        'detection results reach the view throttled; equal views do not '
        'notify', () async {
      var now = Duration.zero;
      var detections = 0;
      var notifications = 0;
      final gates = <Completer<void>>[];
      final session = SelfieCaptureSession<int>(
        clock: () => now,
        challenge: LivenessChallenge.blink,
        detect: (frame, {required readText}) async {
          detections++;
          final gate = Completer<void>();
          gates.add(gate);
          await gate.future;
          return const FrameSignals(faces: []);
        },
      );
      session.view.addListener(() => notifications++);
      // 10 frames while the first detection is still running.
      final first = session.onFrame(0);
      for (var i = 1; i < 10; i++) {
        now = ms(i * 33);
        unawaited(session.onFrame(i));
      }
      expect(detections, 1);
      expect(session.throttle.droppedBusy, 9);
      now = ms(330);
      gates.single.complete();
      await first;
      expect(notifications, 1); // starting → noFace
      // Same result again: no rebuild.
      now = ms(900);
      final second = session.onFrame(10);
      gates.last.complete();
      await second;
      expect(detections, 2);
      expect(notifications, 1);
      session.dispose();
    });

    test('a detector error switches to the manual shot', () async {
      final session = SelfieCaptureSession<int>(
        clock: () => Duration.zero,
        detect: (frame, {required readText}) =>
            Future.error(UnsupportedError('format')),
      );
      expect(session.manual.value, isFalse);
      await session.onFrame(0);
      expect(session.manual.value, isTrue);
      // Frames after that are ignored.
      await session.onFrame(1);
      expect(session.throttle.offered, 1);
      session.dispose();
    });

    test('reset gives a new attempt and ignores results of the old one',
        () async {
      var now = Duration.zero;
      final gate = Completer<void>();
      final session = SelfieCaptureSession<int>(
        clock: () => now,
        challenge: LivenessChallenge.blink,
        detect: (frame, {required readText}) async {
          await gate.future;
          return FrameSignals(
            faces: [
              FaceSample(
                box: Rect.fromCenter(
                  center: const Offset(0.36, 0.40),
                  width: 0.2,
                  height: 0.28,
                ),
              ),
            ],
          );
        },
      );
      final pending = session.onFrame(0);
      session.reset();
      now = ms(200);
      gate.complete();
      await pending;
      expect(session.view.value.faceInOval, isFalse);
      session.dispose();
    });
  });

  group('frame → screen mapping', () {
    test('cover mapping centres a 720×1280 frame on a 390×844 screen', () {
      final map = CoverMapping(
        image: const Size(720, 1280),
        screen: const Size(390, 844),
      );
      final r = map.normalize(const Rect.fromLTWH(310, 590, 100, 100));
      expect(r.center.dx, closeTo(0.5, 0.01));
      expect(r.center.dy, closeTo(0.5, 0.01));
    });

    test('card hint: text beside the face counts, text on it does not', () {
      final face = Rect.fromCenter(
        center: const Offset(0.36, 0.40),
        width: 0.3,
        height: 0.3,
      );
      expect(
        cardTextNearFace(
          [
            Rect.fromCenter(
              center: const Offset(0.36, 0.42),
              width: 0.1,
              height: 0.05,
            ),
          ],
          face,
        ),
        isFalse,
      );
      expect(
        cardTextNearFace(
          [
            Rect.fromCenter(
              center: const Offset(0.8, 0.45),
              width: 0.2,
              height: 0.05,
            ),
          ],
          face,
        ),
        isTrue,
      );
      expect(
        cardTextNearFace(
          [
            Rect.fromCenter(
              center: const Offset(0.8, 0.95),
              width: 0.2,
              height: 0.05,
            ),
          ],
          face,
        ),
        isFalse,
      );
    });
  });
}
