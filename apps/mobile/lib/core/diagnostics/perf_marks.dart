import 'dart:developer' as developer;

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/scheduler.dart';

/// App-side timeline markers for the on-device performance suite
/// (`integration_test/perf/`, docs/perf/APP_DEVICE_PERF.md).
///
/// Every call is a no-op in a release build (one constant check), so the
/// store build pays nothing. In debug and profile it writes a named instant
/// event to the Dart timeline (visible in DevTools / Perfetto) and keeps the
/// time since the first mark, so the suite can read the numbers back.
abstract final class PerfMarks {
  static final Stopwatch _clock = Stopwatch();
  static final Map<String, int> _once = {};
  static final List<double> _videoStartMs = [];
  static bool _feedMarked = false;

  /// Marks the very first moment (the entry of `runLawBid`).
  static void start() {
    if (kReleaseMode) return;
    if (!_clock.isRunning) _clock.start();
    mark('lb.main');
  }

  /// Names a moment once (the first call wins), in microseconds since
  /// [start].
  static void mark(String name) {
    if (kReleaseMode) return;
    if (!_clock.isRunning) _clock.start();
    if (_once.containsKey(name)) return;
    _once[name] = _clock.elapsedMicroseconds;
    developer.Timeline.instantSync(name);
  }

  /// Microseconds since [start] when [name] was marked, or null.
  static int? at(String name) => _once[name];

  /// All marks (name -> microseconds since [start]).
  static Map<String, int> get all => Map.unmodifiable(_once);

  /// The first post card of the feed was built and its frame drawn: the
  /// "first meaningful frame" of a cold start.
  static void feedCardBuilt() {
    if (kReleaseMode || _feedMarked) return;
    _feedMarked = true;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      mark('lb.first_feed_frame');
    });
  }

  /// A reel / feed video went from "told to play" to its picture moving.
  static void videoStarted(Duration sinceActive) {
    if (kReleaseMode) return;
    _videoStartMs.add(sinceActive.inMicroseconds / 1000);
    developer.Timeline.instantSync(
      'lb.video_first_motion',
      arguments: {'ms': sinceActive.inMilliseconds},
    );
  }

  /// Start times of the videos since the last call, in ms.
  static List<double> takeVideoStarts() {
    final out = List<double>.of(_videoStartMs);
    _videoStartMs.clear();
    return out;
  }
}
