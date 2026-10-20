import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';

enum StoryRingState {
  /// No live story: a plain avatar.
  none,

  /// Unseen stories: the gold gradient ring.
  unseen,

  /// Everything seen: a thin grey ring.
  seen,

  /// Publishing failed: a red ring.
  failed,
}

/// An avatar with the story ring around it. [progress] (0..1) replaces the
/// ring with a progress arc while the viewer's own story is being posted;
class StoryRingAvatar extends StatelessWidget {
  const StoryRingAvatar({
    required this.user,
    required this.state,
    this.size = 64,
    this.progress,
    super.key,
  });

  final StoryUser user;
  final StoryRingState state;
  final double size;
  final double? progress;

  /// Width of the ring plus the gap to the avatar.
  static const double ring = 2.5;
  static const double gap = 3;

  static double outerFor(double size) => size + 2 * (ring + gap);

  double get outer => outerFor(size);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final url = user.avatarUrl;
    return SizedBox(
      width: outer,
      height: outer,
      child: CustomPaint(
        painter: _RingPainter(
          state: state,
          progress: progress,
          gold: colors.gold,
          goldLight: colors.goldLight,
          goldDark: colors.goldDark,
          grey: colors.textSecondary.withValues(alpha: 0.55),
          danger: colors.danger,
          track: colors.border,
        ),
        child: Center(
          child: AppAvatar(
            size: size,
            initials: user.initials,
            imageProvider:
                url == null ? null : appNetworkImage(url, decodeWidthFor(size)),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.state,
    required this.progress,
    required this.gold,
    required this.goldLight,
    required this.goldDark,
    required this.grey,
    required this.danger,
    required this.track,
  });

  final StoryRingState state;
  final double? progress;
  final Color gold;
  final Color goldLight;
  final Color goldDark;
  final Color grey;
  final Color danger;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final width = progress != null || state == StoryRingState.unseen
        ? StoryRingAvatar.ring
        : StoryRingAvatar.ring * 0.6;
    final arc = rect.deflate(width / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round;
    if (progress != null) {
      canvas
        ..drawArc(arc, 0, math.pi * 2, false, paint..color = track)
        ..drawArc(
          arc,
          -math.pi / 2,
          math.pi * 2 * progress!.clamp(0.02, 1),
          false,
          paint..color = gold,
        );
      return;
    }
    switch (state) {
      case StoryRingState.none:
        return;
      case StoryRingState.seen:
        canvas.drawArc(arc, 0, math.pi * 2, false, paint..color = grey);
      case StoryRingState.failed:
        canvas.drawArc(arc, 0, math.pi * 2, false, paint..color = danger);
      case StoryRingState.unseen:
        paint.shader = SweepGradient(
          colors: [gold, goldLight, goldDark, gold],
          transform: const GradientRotation(-math.pi / 2),
        ).createShader(rect);
        canvas.drawArc(arc, 0, math.pi * 2, false, paint);
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.state != state ||
      old.progress != progress ||
      old.gold != gold ||
      old.grey != grey ||
      old.danger != danger ||
      old.track != track;
}
