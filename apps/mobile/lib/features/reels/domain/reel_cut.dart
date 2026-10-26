import 'dart:math' as math;

import 'package:flutter/foundation.dart';

/// Owner 2026-10-05: how a reel is cut from a longer video, like Instagram
/// — the part it plays ([startMs]..[endMs], at most the admin's
/// `video.max_duration_sec`) and the cover frame ([coverMs], inside that
/// part). The file itself is uploaded whole; the server stores the range
/// and the player plays only it.
@immutable
class ReelCut {
  const ReelCut({
    required this.totalMs,
    required this.startMs,
    required this.endMs,
    required this.coverMs,
  });

  /// The first [maxMs] of a [totalMs] video, cover = its first frame.
  factory ReelCut.initial(int totalMs, int maxMs) => ReelCut(
        totalMs: totalMs,
        startMs: 0,
        endMs: math.min(totalMs, maxMs),
        coverMs: 0,
      );

  /// The shortest reel.
  static const minMs = 1000;

  final int totalMs;
  final int startMs;
  final int endMs;
  final int coverMs;

  int get lengthMs => endMs - startMs;

  /// Seconds sent as the source length (rounded up, as the server expects).
  int get sourceSec => (totalMs / 1000).ceil();

  /// False = the whole video plays (no range is sent).
  bool get trimmed => startMs > 0 || endMs < totalMs;

  /// A new range from the slider. Keeps it within the video, ≥ [minMs] and
  /// ≤ [maxMs]: when a handle pulls it longer, the other one follows.
  ReelCut withRange(int start, int end, int maxMs) {
    final movedStart = start != startMs;
    var s = start.clamp(0, totalMs);
    var e = end.clamp(0, totalMs);
    if (e - s < minMs) {
      if (movedStart) {
        s = math.max(0, e - minMs);
      } else {
        e = math.min(totalMs, s + minMs);
      }
    }
    if (e - s > maxMs) {
      if (movedStart) {
        e = s + maxMs;
      } else {
        s = e - maxMs;
      }
    }
    return ReelCut(
      totalMs: totalMs,
      startMs: s,
      endMs: e,
      coverMs: coverMs.clamp(s, e),
    );
  }

  ReelCut withCover(int ms) => ReelCut(
        totalMs: totalMs,
        startMs: startMs,
        endMs: endMs,
        coverMs: ms.clamp(startMs, endMs),
      );
}

/// "1:05" for a slider label.
String formatCutTime(int ms) {
  final s = (ms / 1000).round();
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}
