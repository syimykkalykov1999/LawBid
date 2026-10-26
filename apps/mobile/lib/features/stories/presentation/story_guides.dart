import 'package:flutter/foundation.dart' show setEquals;
import 'package:flutter/material.dart';
import 'package:lawbid/features/stories/domain/story_snap.dart';

/// Owner 2026-10-21 (Instagram story editor): the thin lines a dragged
/// sticker sits on — the centre lines, the safe edges, and a level line
/// through the sticker when it was turned straight. White with a soft
/// shadow, readable on any photo or gradient.
class StoryGuidesPainter extends CustomPainter {
  StoryGuidesPainter({required this.guides, required this.at});

  final Set<StoryGuide> guides;

  /// The sticker's centre (px), for the level line.
  final Offset at;

  @override
  void paint(Canvas canvas, Size size) {
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.25)
      ..strokeWidth = 2.5;
    final line = Paint()
      ..color = Colors.white.withValues(alpha: 0.9)
      ..strokeWidth = 1;
    void draw(Offset a, Offset b) {
      canvas
        ..drawLine(a, b, shadow)
        ..drawLine(a, b, line);
    }

    final w = size.width;
    final h = size.height;
    final ix = w * kStorySafeInset;
    final iy = h * kStorySafeInset;
    for (final g in guides) {
      switch (g) {
        case StoryGuide.centerX:
          draw(Offset(w / 2, 0), Offset(w / 2, h));
        case StoryGuide.centerY:
          draw(Offset(0, h / 2), Offset(w, h / 2));
        case StoryGuide.left:
          draw(Offset(ix, 0), Offset(ix, h));
        case StoryGuide.right:
          draw(Offset(w - ix, 0), Offset(w - ix, h));
        case StoryGuide.top:
          draw(Offset(0, iy), Offset(w, iy));
        case StoryGuide.bottom:
          draw(Offset(0, h - iy), Offset(w, h - iy));
        case StoryGuide.angle:
          draw(Offset(0, at.dy), Offset(w, at.dy));
      }
    }
  }

  @override
  bool shouldRepaint(StoryGuidesPainter old) =>
      old.at != at || !setEquals(old.guides, guides);
}
