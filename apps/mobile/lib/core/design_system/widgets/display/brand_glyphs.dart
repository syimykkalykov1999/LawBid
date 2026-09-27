import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';

/// Fallback glyph color when no [IconTheme] color is set: the theme's
/// `text` token (stage 1.7 mobile — replaces a hardcoded black), or the
/// Material scheme's onSurface outside an AppTheme (e.g. bare tests).
Color _fallbackColor(BuildContext context) {
  final theme = Theme.of(context);
  return theme.extension<AppColorTokens>()?.text ?? theme.colorScheme.onSurface;
}

/// Hand-drawn vector glyphs for the welcome screen's social-login row and
/// small chevrons used elsewhere in auth/onboarding (file 07 §6.1: "Ряд из
/// трёх иконок-кнопок: email, Apple, Google").
///
/// Why `CustomPainter` and not `flutter_svg` + asset files: the design
/// system has no SVG-rendering dependency (see pubspec.yaml — only fonts are
/// bundled assets) and every other hand-drawn shape in this codebase
/// (`ScalesLogo`, `WatermarkScales`, the gavel in `GavelStrikeButton`) is
/// already a `CustomPainter`, so this follows the established pattern rather
/// than introducing a new one (file 07 §6.5: "новые компоненты не
/// придумывать без согласования").
///
/// Geometry is transcribed exactly (absolute point-for-point, bezier
/// control points hand-resolved from the original relative SVG path
/// commands) from the reference markup in the owner-approved welcome-screen
/// preview artifact, viewBox 24x24 in all cases, so these render pixel-true
/// to what the owner already reviewed and liked. All three are painted in
/// [AppIconButton]'s `IconTheme` color (`colors.text`) per file 07 §4's
/// generic `AppIconButton` definition — no per-brand color exception is
/// carved out, since file 07 doesn't specify one (Google's real brand
/// guidelines call for a full-color glyph here; flagged as a possible
/// follow-up in docs/CHANGELOG.md rather than assumed).
/// Envelope outline (email). Stroke-only: `rect(3,5,18,14,rx2)` + the
/// flap path `M3,7 L12,13 L21,7`.
class EmailGlyph extends StatelessWidget {
  const EmailGlyph({super.key});

  @override
  Widget build(BuildContext context) {
    final color = IconTheme.of(context).color ?? _fallbackColor(context);
    return CustomPaint(size: const Size(20, 20), painter: _EmailPainter(color));
  }
}

class _EmailPainter extends CustomPainter {
  _EmailPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24;
    canvas.save();
    canvas.scale(scale, scale);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(3, 5, 18, 14), const Radius.circular(2)),
      paint,
    );
    final flap = Path()
      ..moveTo(3, 7)
      ..lineTo(12, 13)
      ..lineTo(21, 7);
    canvas.drawPath(flap, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _EmailPainter oldDelegate) => oldDelegate.color != color;
}

/// Apple silhouette (body + leaf), filled, viewBox 24x24. Bezier control
/// points hand-resolved from the reference SVG's relative `c`/`s` commands
/// (see class doc comment) — do not "simplify"/redraw freehand, the exact
/// points are what makes this read as the real glyph at 20px.
class AppleGlyph extends StatelessWidget {
  const AppleGlyph({super.key});

  @override
  Widget build(BuildContext context) {
    final color = IconTheme.of(context).color ?? _fallbackColor(context);
    return CustomPaint(size: const Size(20, 20), painter: _ApplePainter(color));
  }
}

class _ApplePainter extends CustomPainter {
  _ApplePainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24;
    canvas.save();
    canvas.scale(scale, scale);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final body = Path()
      ..moveTo(16.7, 12.4)
      ..cubicTo(16.7, 10.3, 18.4, 9.3, 18.5, 9.2)
      ..cubicTo(17.5, 7.8, 16.0, 7.6, 15.5, 7.6)
      ..cubicTo(14.2, 7.5, 13.0, 8.4, 12.4, 8.4)
      ..cubicTo(11.8, 8.4, 10.8, 7.7, 9.7, 7.7)
      ..cubicTo(8.3, 7.7, 7.1, 8.5, 6.4, 9.7)
      ..cubicTo(5.0, 12.2, 6.0, 15.8, 7.4, 17.8)
      ..cubicTo(8.1, 18.8, 8.9, 19.9, 9.9, 19.8)
      ..cubicTo(10.9, 19.7, 11.3, 19.1, 12.5, 19.1)
      ..cubicTo(13.7, 19.1, 14.1, 19.8, 15.2, 19.7)
      ..cubicTo(16.3, 19.7, 17.0, 18.7, 17.7, 17.7)
      ..cubicTo(18.5, 16.6, 18.8, 15.5, 18.8, 15.4)
      ..cubicTo(18.7, 15.4, 16.7, 14.6, 16.7, 12.4)
      ..close();
    canvas.drawPath(body, paint);

    final leaf = Path()
      ..moveTo(14.6, 6.0)
      ..cubicTo(15.2, 5.3, 15.6, 4.3, 15.5, 3.4)
      ..cubicTo(14.6, 3.4, 13.6, 4.0, 13.0, 4.7)
      ..cubicTo(12.5, 5.3, 12.0, 6.3, 12.1, 7.2)
      ..cubicTo(13.1, 7.3, 14.0, 6.7, 14.6, 6.0)
      ..close();
    canvas.drawPath(leaf, paint);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ApplePainter oldDelegate) => oldDelegate.color != color;
}

/// Google "G" mark outline, filled, viewBox 24x24 — the single silhouette
/// path (no per-quadrant brand colors), monochrome per this file's class
/// doc comment.
class GoogleGlyph extends StatelessWidget {
  const GoogleGlyph({super.key});

  @override
  Widget build(BuildContext context) {
    final color = IconTheme.of(context).color ?? _fallbackColor(context);
    return CustomPaint(size: const Size(20, 20), painter: _GooglePainter(color));
  }
}

class _GooglePainter extends CustomPainter {
  _GooglePainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24;
    canvas.save();
    canvas.scale(scale, scale);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final g = Path()
      ..moveTo(21.35, 11.1)
      ..lineTo(12.0, 11.1)
      ..lineTo(12.0, 14.0)
      ..lineTo(17.35, 14.0)
      ..cubicTo(17.1, 15.4, 15.7, 18.1, 12.0, 18.1)
      ..cubicTo(8.8, 18.1, 6.2, 15.45, 6.2, 12.2)
      ..cubicTo(6.2, 8.95, 8.8, 6.3, 12.0, 6.3)
      ..cubicTo(13.8, 6.3, 15.0, 7.05, 15.7, 7.7)
      ..lineTo(18.2, 5.3)
      ..cubicTo(16.85, 3.7, 14.65, 2.8, 12.0, 2.8)
      ..cubicTo(6.9, 2.8, 2.75, 6.95, 2.75, 12.0)
      ..cubicTo(2.75, 17.05, 6.9, 21.2, 12.0, 21.2)
      ..cubicTo(18.9, 21.2, 20.9, 16.35, 20.9, 13.85)
      ..cubicTo(20.9, 13.35, 20.85, 12.9, 20.75, 12.5)
      ..close();
    canvas.drawPath(g, paint);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _GooglePainter oldDelegate) => oldDelegate.color != color;
}

/// Chevron-left (back arrow) and chevron-down (country chip disclosure),
/// both stroke-only, viewBox 24x24. Shared painter since both are a single
/// 2-segment polyline, just rotated.
class ChevronGlyph extends StatelessWidget {
  const ChevronGlyph({super.key, required this.direction, this.size = 20, this.color});

  final ChevronDirection direction;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final resolved = color ?? IconTheme.of(context).color ?? _fallbackColor(context);
    return CustomPaint(
      size: Size(size, size),
      painter: _ChevronPainter(resolved, direction),
    );
  }
}

enum ChevronDirection { left, down }

class _ChevronPainter extends CustomPainter {
  _ChevronPainter(this.color, this.direction);
  final Color color;
  final ChevronDirection direction;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24;
    canvas.save();
    canvas.scale(scale, scale);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = direction == ChevronDirection.left ? 2.0 : 2.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final path = direction == ChevronDirection.left
        ? (Path()
          ..moveTo(15, 18)
          ..lineTo(9, 12)
          ..lineTo(15, 6))
        : (Path()
          ..moveTo(6, 9)
          ..lineTo(12, 15)
          ..lineTo(18, 9));
    canvas.drawPath(path, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ChevronPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.direction != direction;
}
