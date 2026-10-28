import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:lawbid/features/verification/application/detection_throttle.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';

/// Runs the on-device detector on a throttled frame stream.
typedef SelfieDetect<F> = Future<FrameSignals> Function(
  F frame, {
  required bool readText,
});

/// Owner 2026-10-28 (ID selfie camera): glue between the camera stream,
/// the detector and [SelfieLivenessMachine], without any widget — the
/// screen only forwards frames and listens to [view]. Generic over the
/// frame type so tests feed fake frames with a fake detector and clock.
///
/// - frames go through [DetectionThrottle] (one detection in flight, the
///   rest dropped; adaptive interval), so a slow detector never builds a
///   backlog and the preview keeps its native frame rate;
/// - [view] only notifies when what is drawn changed (no rebuild storms);
/// - a detector error switches the session to [manual] (overlay + shutter,
///   liveness "not checked") instead of leaving the attorney stuck.
class SelfieCaptureSession<F> {
  SelfieCaptureSession({
    required SelfieDetect<F> detect,
    required Duration Function() clock,
    SelfieLivenessConfig config = const SelfieLivenessConfig(),
    LivenessChallenge? challenge,
    DetectionThrottle? throttle,
    math.Random? random,
  })  : _detect = detect,
        _clock = clock,
        _config = config,
        _random = random,
        throttle = throttle ?? DetectionThrottle() {
    _machine = SelfieLivenessMachine(
      challenge: challenge ?? LivenessChallenge.random(_random),
      config: _config,
    );
    view = ValueNotifier(_machine.view);
  }

  final SelfieDetect<F> _detect;
  final Duration Function() _clock;
  final SelfieLivenessConfig _config;
  final math.Random? _random;
  final DetectionThrottle throttle;

  late SelfieLivenessMachine _machine;
  late final ValueNotifier<SelfieLivenessView> view;

  /// true once the detector failed: manual capture from here on.
  final ValueNotifier<bool> manual = ValueNotifier(false);

  Duration? _lastText;
  bool _disposed = false;
  int _generation = 0;

  SelfieLivenessMachine get machine => _machine;

  /// A new attempt (after Retake): fresh random prompt. The caller restarts
  /// its clock first, so the timers count from the new start.
  void reset() {
    _generation++;
    _lastText = null;
    _machine = SelfieLivenessMachine(
      challenge: LivenessChallenge.random(_random),
      config: _config,
    );
    _publish(_machine.view);
  }

  /// A camera frame arrived. Returns without awaiting when it is dropped.
  Future<void> onFrame(F frame) async {
    if (_disposed || manual.value) return;
    final now = _clock();
    if (!throttle.offer(now)) return;
    final generation = _generation;
    final readText = DetectionThrottle.textDue(
      now: now,
      lastText: _lastText,
      cardSeen: _machine.cardDetected,
    );
    if (readText) _lastText = now;
    try {
      final signals = await _detect(frame, readText: readText);
      if (_disposed || generation != _generation) return;
      _publish(_machine.add(signals, _clock()));
    } on Object {
      if (!_disposed) manual.value = true;
    } finally {
      throttle.done(_clock() - now);
    }
  }

  /// Timers (fallback button, hold progress) advance without frames.
  void tick() {
    if (_disposed) return;
    _publish(_machine.tick(_clock()));
  }

  void _publish(SelfieLivenessView v) {
    if (_disposed) return;
    if (view.value != v) view.value = v;
  }

  void dispose() {
    _disposed = true;
    view.dispose();
    manual.dispose();
  }
}
