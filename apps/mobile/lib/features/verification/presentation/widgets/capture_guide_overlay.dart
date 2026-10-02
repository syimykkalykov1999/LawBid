import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/verification/presentation/document_source.dart';

/// Guide frame over the camera preview: dims everything outside the
/// frame, draws a gold outline (card corners / face oval) that gently
/// "breathes" while framing and turns solid once a shot is taken. Static
/// under reduce-motion. Also used, small, as the selfie step illustration.
class CaptureGuideOverlay extends StatefulWidget {
  const CaptureGuideOverlay({
    required this.guide,
    super.key,
    this.captured = false,
    this.scrim = true,
    this.animate = true,
  });

  final CaptureGuide guide;
  final bool captured;
  final bool scrim;

  /// false: a static illustration (no ticking animation).
  final bool animate;

  @override
  State<CaptureGuideOverlay> createState() => _CaptureGuideOverlayState();
}

class _CaptureGuideOverlayState extends State<CaptureGuideOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: AppMotion.shimmer,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(CaptureGuideOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _sync() {
    final animate = widget.animate && !context.reduceMotion && !widget.captured;
    if (animate && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!animate && _pulse.isAnimating) {
      _pulse
        ..stop()
        ..value = 1;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _pulse,
        builder: (context, _) => CustomPaint(
          size: Size.infinite,
          painter: _GuidePainter(
            guide: widget.guide,
            scrim: widget.scrim ? colors.navy.withValues(alpha: 0.62) : null,
            stroke: widget.captured
                ? colors.success
                : Color.lerp(
                    colors.goldDark,
                    colors.goldLight,
                    _pulse.isAnimating ? _pulse.value : 1,
                  )!,
          ),
        ),
      ),
    );
  }
}

class _GuidePainter extends CustomPainter {
  _GuidePainter({
    required this.guide,
    required this.scrim,
    required this.stroke,
  });

  final CaptureGuide guide;
  final Color? scrim;
  final Color stroke;

  /// ISO/IEC 7810 ID-1 (driver license, state ID, bar card).
  static const double _cardRatio = 1.586;
  static const double _pageRatio = 0.72;

  Rect _frame(Size size) {
    final center = Offset(size.width / 2, size.height * 0.46);
    switch (guide) {
      case CaptureGuide.card:
        final w = size.width * 0.86;
        return Rect.fromCenter(
          center: center,
          width: w,
          height: w / _cardRatio,
        );
      case CaptureGuide.document:
        final h = size.height * 0.52;
        final w = (h * _pageRatio).clamp(0, size.width * 0.86).toDouble();
        return Rect.fromCenter(
          center: center,
          width: w,
          height: w / _pageRatio,
        );
      case CaptureGuide.selfie:
        final w = size.width * 0.66;
        return Rect.fromCenter(center: center, width: w, height: w * 1.3);
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final frame = _frame(size);
    final hole = guide == CaptureGuide.selfie
        ? (Path()..addOval(frame))
        : (Path()
          ..addRRect(
            RRect.fromRectAndRadius(
              frame,
              const Radius.circular(AppRadii.card),
            ),
          ));
    final fill = scrim;
    if (fill != null) {
      final path = Path()
        ..fillType = PathFillType.evenOdd
        ..addRect(Offset.zero & size)
        ..addPath(hole, Offset.zero);
      canvas.drawPath(path, Paint()..color = fill);
    }
    final line = Paint()
      ..color = stroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    if (guide == CaptureGuide.selfie) {
      canvas.drawPath(hole, line);
      return;
    }
    canvas.drawPath(hole, line..color = stroke.withValues(alpha: 0.45));
    // Bold corner brackets.
    final corner = Paint()
      ..color = stroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    const len = AppSpacing.xl;
    for (final (p, dx, dy) in [
      (frame.topLeft, 1.0, 1.0),
      (frame.topRight, -1.0, 1.0),
      (frame.bottomLeft, 1.0, -1.0),
      (frame.bottomRight, -1.0, -1.0),
    ]) {
      canvas
        ..drawLine(p, p.translate(len * dx, 0), corner)
        ..drawLine(p, p.translate(0, len * dy), corner);
    }
  }

  @override
  bool shouldRepaint(_GuidePainter old) =>
      old.stroke != stroke || old.scrim != scrim || old.guide != guide;
}
