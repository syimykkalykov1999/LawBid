import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';

/// Owner 2026-10-05: backgrounds for anything that has no picture of its
/// own (a text-only post, a practice without a photo). Always dark —
/// navy / ink / espresso with gold linework — in both themes, like the
/// case "dossier" covers, so white text on it reads the same everywhere.
/// The variant comes from a stable seed (a post id) so a grid of
/// text-only posts is not one flat colour.
const int kBrandPatternVariants = 4;

/// FNV-1a over the seed: the same post gets the same pattern everywhere.
int brandPatternVariant(String? seed) {
  if (seed == null || seed.isEmpty) return 0;
  var h = 0x811c9dc5;
  for (final c in seed.codeUnits) {
    h = ((h ^ c) * 0x01000193) & 0xffffffff;
  }
  return h % kBrandPatternVariants;
}

/// A decorative, non-semantic background filling its box.
class BrandPattern extends StatelessWidget {
  const BrandPattern({this.seed, this.variant, super.key});

  /// Picks the variant when [variant] is null.
  final String? seed;
  final int? variant;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ExcludeSemantics(
      child: CustomPaint(
        painter: _BrandPatternPainter(
          variant:
              (variant ?? brandPatternVariant(seed)) % kBrandPatternVariants,
          navy: colors.navy,
          gold: colors.gold,
        ),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _BrandPatternPainter extends CustomPainter {
  _BrandPatternPainter({
    required this.variant,
    required this.navy,
    required this.gold,
  });

  final int variant;
  final Color navy;
  final Color gold;

  Color get _ink => Color.lerp(navy, Colors.black, 0.78)!;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.clipRect(rect);
    final line = Paint()
      ..style = PaintingStyle.stroke
      ..isAntiAlias = true;
    switch (variant) {
      case 0:
        // Navy into ink, fine gold pinstripes, a glow at the top right.
        _fill(
          canvas,
          rect,
          Alignment.topLeft,
          Alignment.bottomRight,
          [navy, _ink],
        );
        line
          ..color = gold.withValues(alpha: 0.07)
          ..strokeWidth = 1;
        for (var x = -size.height; x < size.width; x += 12) {
          canvas.drawLine(
            Offset(x, size.height),
            Offset(x + size.height, 0),
            line,
          );
        }
        _glow(canvas, Offset(size.width, 0), size.longestSide * 0.7, 0.16);
      case 1:
        // Espresso: ink warmed with gold, a dot grid.
        _fill(
          canvas,
          rect,
          Alignment.topCenter,
          Alignment.bottomCenter,
          [Color.lerp(_ink, gold, 0.16)!, _ink],
        );
        final dot = Paint()..color = gold.withValues(alpha: 0.11);
        const gap = 14.0;
        for (var y = gap / 2; y < size.height; y += gap) {
          for (var x = gap / 2; x < size.width; x += gap) {
            canvas.drawCircle(Offset(x, y), 1, dot);
          }
        }
        _glow(canvas, Offset(0, size.height), size.longestSide * 0.6, 0.12);
      case 2:
        // Midnight: ink with gold rings rising from the bottom right.
        canvas.drawRect(rect, Paint()..color = _ink);
        final c = Offset(size.width * 1.05, size.height * 1.05);
        final step = math.max<double>(size.shortestSide * 0.11, 10);
        var i = 0;
        for (var r = step; r < size.longestSide * 1.6; r += step, i++) {
          line
            ..color = gold.withValues(alpha: math.max(0.03, 0.16 - i * 0.012))
            ..strokeWidth = 1;
          canvas.drawCircle(c, r, line);
        }
        _glow(canvas, c, size.longestSide * 0.6, 0.14);
      default:
        // Dossier: a navy vignette with a thin inset gold frame.
        canvas.drawRect(
          rect,
          Paint()
            ..shader = RadialGradient(
              center: const Alignment(-0.6, -0.7),
              radius: 1.3,
              colors: [Color.lerp(navy, gold, 0.08)!, navy, _ink],
              stops: const [0, 0.5, 1],
            ).createShader(rect),
        );
        final inset = math.max<double>(size.shortestSide * 0.035, 4);
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            rect.deflate(inset),
            Radius.circular(inset * 1.5),
          ),
          line
            ..color = gold.withValues(alpha: 0.32)
            ..strokeWidth = 1,
        );
    }
  }

  void _fill(
    Canvas canvas,
    Rect rect,
    Alignment begin,
    Alignment end,
    List<Color> colors,
  ) {
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(begin: begin, end: end, colors: colors)
            .createShader(rect),
    );
  }

  void _glow(Canvas canvas, Offset c, double r, double alpha) {
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..shader = RadialGradient(
          colors: [gold.withValues(alpha: alpha), gold.withValues(alpha: 0)],
        ).createShader(Rect.fromCircle(center: c, radius: r)),
    );
  }

  @override
  bool shouldRepaint(_BrandPatternPainter old) =>
      old.variant != variant || old.navy != navy || old.gold != gold;
}
