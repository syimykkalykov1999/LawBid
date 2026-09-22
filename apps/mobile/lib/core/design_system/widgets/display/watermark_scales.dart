import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';

/// Faint background scales watermark (file 07 §4): outline-only, no fill, no
/// text, 200x180 default, opacity from [AppColorTokens.watermarkOpacity].
/// Only used on the phone and OTP screens (stage 1.7); positioning ("прижат
/// к правому краю, смещение −40 по горизонтали, отступ снизу 70") is the
/// caller's job via `Positioned`/`Align`, not baked into this widget, so it
/// stays reusable if a future screen wants it placed differently.
class WatermarkScales extends StatelessWidget {
  const WatermarkScales({super.key, this.width = 200, this.height = 180});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ExcludeSemantics(
      child: CustomPaint(
        size: Size(width, height),
        painter: _WatermarkPainter(colors: colors),
      ),
    );
  }
}

class _WatermarkPainter extends CustomPainter {
  _WatermarkPainter({required this.colors});

  final AppColorTokens colors;

  @override
  void paint(Canvas canvas, Size size) {
    // Reuses the scales' 300x212 design coordinates (file 07 §5.1), scaled
    // to fit `size` by width, static pose (angle = 0 — watermarks never
    // animate).
    final scale = size.width / 300;
    canvas.save();
    canvas.scale(scale, scale);

    final paint = Paint()
      ..color = colors.text.withValues(alpha: colors.watermarkOpacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.drawCircle(const Offset(150, 16), 5, paint);
    canvas.drawLine(const Offset(150, 21), const Offset(150, 192), paint);
    canvas.drawLine(const Offset(112, 192), const Offset(188, 192), paint);
    canvas.drawLine(const Offset(122, 203), const Offset(178, 203), paint);
    canvas.drawLine(const Offset(50, 44), const Offset(250, 44), paint);
    canvas.drawCircle(const Offset(150, 44), 6, paint);

    // Left pan wireframe.
    canvas.drawLine(const Offset(50, 44), const Offset(14, 118), paint);
    canvas.drawLine(const Offset(50, 44), const Offset(86, 118), paint);
    final leftBowl = Path()
      ..moveTo(12, 118)
      ..lineTo(88, 118)
      ..arcToPoint(const Offset(12, 118), radius: const Radius.elliptical(38, 34), clockwise: true);
    canvas.drawPath(leftBowl, paint);

    // Right pan wireframe.
    canvas.drawLine(const Offset(250, 44), const Offset(214, 118), paint);
    canvas.drawLine(const Offset(250, 44), const Offset(286, 118), paint);
    final rightBowl = Path()
      ..moveTo(212, 118)
      ..lineTo(288, 118)
      ..arcToPoint(const Offset(212, 118), radius: const Radius.elliptical(38, 34), clockwise: true);
    canvas.drawPath(rightBowl, paint);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _WatermarkPainter oldDelegate) => oldDelegate.colors != colors;
}
