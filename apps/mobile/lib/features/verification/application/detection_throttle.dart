/// Owner 2026-10-28 (ID selfie camera, "never freeze"): decides which
/// camera frames go to the on-device detector. The preview itself runs at
/// the camera's native rate (it is a texture, untouched by this); only
/// detection is throttled:
///
/// - at most ONE detection in flight — a frame that arrives while the
///   detector is busy is dropped, never queued (no backlog, no latency
///   build-up);
/// - at least [interval] between detections (≈ every 3rd–5th frame of a
///   30 fps stream);
/// - adaptive: the interval follows the detector's real latency (×1.5),
///   between [minInterval] and [maxInterval], so a slow low-end phone
///   detects less often instead of stuttering.
///
/// Pure Dart with an injected clock value — unit-tested without a camera.
class DetectionThrottle {
  DetectionThrottle({
    this.minInterval = const Duration(milliseconds: 150),
    this.maxInterval = const Duration(milliseconds: 600),
  }) : _interval = minInterval;

  final Duration minInterval;
  final Duration maxInterval;

  Duration _interval;
  Duration? _last;
  bool _busy = false;

  int offered = 0;
  int processed = 0;
  int droppedBusy = 0;
  int skippedInterval = 0;

  bool get busy => _busy;
  Duration get interval => _interval;

  /// A frame arrived at [now]. true = run the detector on it now, then
  /// call [done]; false = drop the frame.
  bool offer(Duration now) {
    offered++;
    if (_busy) {
      droppedBusy++;
      return false;
    }
    final last = _last;
    if (last != null && now - last < _interval) {
      skippedInterval++;
      return false;
    }
    _busy = true;
    _last = now;
    processed++;
    return true;
  }

  /// The detection started by [offer] finished after [latency].
  void done(Duration latency) {
    _busy = false;
    final next = latency * 1.5;
    _interval = next < minInterval
        ? minInterval
        : (next > maxInterval ? maxInterval : next);
  }

  /// Text recognition (the card hint) is heavier: once per [every] at most,
  /// and only while the card has not been seen yet.
  static bool textDue({
    required Duration now,
    required Duration? lastText,
    required bool cardSeen,
    Duration every = const Duration(milliseconds: 900),
  }) =>
      !cardSeen && (lastText == null || now - lastText >= every);
}
