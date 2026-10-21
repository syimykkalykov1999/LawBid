import 'dart:math' as math;
import 'dart:ui' show Size;

import 'package:flutter/foundation.dart';

/// Owner 2026-10-21 (Instagram story editor): the lines a dragged sticker
/// snaps to — the frame's centre (both axes), the safe edges (5 % in) and
/// a straight angle.
enum StoryGuide { centerX, centerY, left, right, top, bottom, angle }

/// The safe edge inset, as a fraction of the frame.
const double kStorySafeInset = 0.05;

/// How close (logical px) a sticker must come to a line to stick to it.
const double kStorySnapPx = 8;

/// How close (radians, ~4°) a turn must come to 0 / ±90° / 180°.
const double kStorySnapAngle = 4 * math.pi / 180;

@immutable
class StorySnapped {
  const StorySnapped({
    required this.x,
    required this.y,
    required this.rotation,
    this.guides = const {},
  });

  final double x;
  final double y;
  final double rotation;

  /// The lines the sticker sits on now (drawn while dragging).
  final Set<StoryGuide> guides;
}

/// Snaps a sticker's RAW position ([x], [y] = its centre as fractions of
/// [frame]) and [rotation]: within [kStorySnapPx] of the centre lines or of
/// a safe edge (the sticker's [half] size in px decides where its edge is)
/// it sits exactly on the line; within [kStorySnapAngle] of a right angle
/// it turns straight. The caller keeps the raw values and shows the snapped
/// ones, so a sticker always leaves a line again once dragged on.
StorySnapped snapStoryTransform({
  required double x,
  required double y,
  required double rotation,
  required Size frame,
  Size half = Size.zero,
  double threshold = kStorySnapPx,
  double angleThreshold = kStorySnapAngle,
}) {
  final guides = <StoryGuide>{};
  final w = frame.width;
  final h = frame.height;
  if (w <= 0 || h <= 0) {
    return StorySnapped(x: x, y: y, rotation: rotation);
  }

  double axis(
    double v,
    double size,
    double halfPx,
    StoryGuide center,
    StoryGuide start,
    StoryGuide end,
  ) {
    final px = v * size;
    final inset = size * kStorySafeInset;
    final candidates = <(double, StoryGuide)>[
      (size / 2, center),
      if (halfPx > 0) ...[
        (inset + halfPx, start),
        (size - inset - halfPx, end),
      ],
    ];
    (double, StoryGuide)? best;
    for (final c in candidates) {
      final d = (px - c.$1).abs();
      if (d <= threshold && (best == null || d < (px - best.$1).abs())) {
        best = c;
      }
    }
    if (best == null) return v;
    guides.add(best.$2);
    return best.$1 / size;
  }

  final sx = axis(
    x,
    w,
    half.width,
    StoryGuide.centerX,
    StoryGuide.left,
    StoryGuide.right,
  );
  final sy = axis(
    y,
    h,
    half.height,
    StoryGuide.centerY,
    StoryGuide.top,
    StoryGuide.bottom,
  );

  var r = rotation;
  const quarter = math.pi / 2;
  final nearest = (rotation / quarter).round() * quarter;
  if ((rotation - nearest).abs() <= angleThreshold) {
    r = nearest;
    // Only a turn that was put straight shows the line (a sticker that was
    // never turned does not).
    if (rotation.abs() > 1e-3) guides.add(StoryGuide.angle);
  }
  return StorySnapped(x: sx, y: sy, rotation: r, guides: guides);
}
