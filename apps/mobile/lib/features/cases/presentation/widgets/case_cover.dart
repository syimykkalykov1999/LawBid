import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-04: a case card never shows the client's face (their
/// photos stay private until a bid is accepted), so every practice has a
/// set of on-brand covers instead, and the client may pick one, or an
/// icon avatar, when posting. Keys match apps/api domain/case-cover.ts:
/// `art:0..3` = a variant of the practice's set, `icon:<name>` = an icon
/// avatar, null = one of the practice's photos picked by the case id.
///
/// Variant 0 is the practice photo (`assets/practice_art/`); 1–3 are
/// drawn here (no assets, any size): pinstripes, rings and a seal, each
/// navy/ink with the practice glyph in gold.
const int kCaseCoverVariants = 4;

/// Icon avatars (`icon:<name>`), in picker order.
const List<(String, IconData)> kCaseCoverIcons = [
  ('balance', AppIcons.balanceRounded),
  ('gavel', AppIcons.gavelRounded),
  ('shield', AppIcons.shieldRounded),
  ('home', AppIcons.homeRounded),
  ('briefcase', AppIcons.businessCenterRounded),
  ('family', AppIcons.familyRestroomRounded),
  ('car', AppIcons.directionsCarFilledRounded),
  ('flight', AppIcons.flightTakeoffRounded),
  ('heart', AppIcons.favoriteRounded),
  ('star', AppIcons.starRounded),
  ('lightbulb', AppIcons.lightbulbRounded),
  ('document', AppIcons.descriptionRounded),
  ('handshake', AppIcons.handshakeOutlined),
  ('globe', AppIcons.publicRounded),
  ('school', AppIcons.schoolRounded),
  ('leaf', AppIcons.ecoRounded),
];

String coverArtKey(int variant) => 'art:$variant';
String coverIconKey(String name) => 'icon:$name';

/// The icon of an `icon:<name>` key, or null.
IconData? coverIconOf(String? key) {
  if (key == null || !key.startsWith('icon:')) return null;
  final name = key.substring(5);
  for (final (n, icon) in kCaseCoverIcons) {
    if (n == name) return icon;
  }
  return null;
}

/// FNV-1a over the id: the same case gets the same cover on every device.
int autoCoverVariant(String seed) {
  var h = 0x811c9dc5;
  for (final c in seed.codeUnits) {
    h = ((h ^ c) * 0x01000193) & 0xffffffff;
  }
  return h % kCaseCoverVariants;
}

/// The variant a key (or, without one, the [seed]) resolves to.
int coverVariantOf(String? key, String? seed) {
  if (key != null && key.startsWith('art:')) {
    final n = int.tryParse(key.substring(4));
    if (n != null && n >= 0 && n < kCaseCoverVariants) return n;
  }
  return seed == null ? 0 : autoCoverVariant(seed);
}

/// A case cover, filling its box.
class CaseCover extends StatelessWidget {
  const CaseCover({
    required this.categoryCode,
    this.practiceCode,
    this.coverKey,
    this.seed,
    super.key,
  });

  final String? categoryCode;
  final String? practiceCode;

  /// `art:N` / `icon:<name>`; null = picked from [seed].
  final String? coverKey;

  /// The case id (stable auto pick); null = variant 0.
  final String? seed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final icon = coverIconOf(coverKey);
    if (icon != null) {
      return ExcludeSemantics(
        child: _IconAvatarCover(icon: icon, colors: colors),
      );
    }
    // Owner 2026-10-04: without a choice, one of the practice's photos
    // (rotated by the case id); a drawn variant only when picked.
    if (coverKey == null || !coverKey!.startsWith('art:')) {
      return PracticePhoto(
        categoryCode: categoryCode,
        practiceCode: practiceCode,
        seed: seed,
      );
    }
    final variant = coverVariantOf(coverKey, seed);
    if (variant == 0) {
      return PracticePhoto(
        categoryCode: categoryCode,
        practiceCode: practiceCode,
      );
    }
    return ExcludeSemantics(
      child: LayoutBuilder(
        builder: (context, box) {
          final h = box.maxHeight.isFinite ? box.maxHeight : 200.0;
          final w = box.maxWidth.isFinite ? box.maxWidth : 320.0;
          final anchor = switch (variant) {
            1 => const Alignment(0.55, 0),
            2 => const Alignment(0.44, 0.1),
            _ => const Alignment(0.5, 0),
          };
          // Rings: the glyph sits inside the inner disc.
          final glyph = math.min<double>(
            math.min(h, w) * (variant == 2 ? 0.26 : 0.4),
            112,
          );
          final c = anchor.alongSize(Size(w, h));
          return Stack(
            fit: StackFit.expand,
            children: [
              CustomPaint(
                painter: _CoverPainter(
                  variant: variant,
                  anchor: anchor,
                  navy: colors.navy,
                  gold: colors.gold,
                  goldLight: colors.goldLight,
                ),
              ),
              Positioned(
                left: c.dx - glyph / 2,
                top: c.dy - glyph / 2,
                width: glyph,
                height: glyph,
                child: AppIcon(
                  practiceGlyph(categoryCode),
                  size: glyph,
                  color: variant == 3 ? colors.goldLight : colors.gold,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// `icon:<name>`: an avatar disc on ink with a faint dot grid.
class _IconAvatarCover extends StatelessWidget {
  const _IconAvatarCover({required this.icon, required this.colors});

  final IconData icon;
  final AppColorTokens colors;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final h = box.maxHeight.isFinite ? box.maxHeight : 200.0;
        final w = box.maxWidth.isFinite ? box.maxWidth : 320.0;
        final disc = math.min<double>(math.min(h, w) * 0.62, 150);
        return Stack(
          fit: StackFit.expand,
          children: [
            CustomPaint(
              painter: _CoverPainter(
                variant: -1,
                anchor: Alignment.center,
                navy: colors.navy,
                gold: colors.gold,
                goldLight: colors.goldLight,
              ),
            ),
            Center(
              child: Container(
                width: disc,
                height: disc,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      Color.lerp(colors.navy, colors.gold, 0.18)!,
                      colors.navy,
                    ],
                  ),
                  border: Border.all(color: colors.gold, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: colors.gold.withValues(alpha: 0.28),
                      blurRadius: 24,
                    ),
                  ],
                ),
                child: Center(
                  child: AppIcon(
                    icon,
                    size: disc * 0.46,
                    color: colors.goldLight,
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Backgrounds: -1 icon avatar, 1 pinstripes, 2 rings, 3 seal.
class _CoverPainter extends CustomPainter {
  _CoverPainter({
    required this.variant,
    required this.anchor,
    required this.navy,
    required this.gold,
    required this.goldLight,
  });

  final int variant;
  final Alignment anchor;
  final Color navy;
  final Color gold;
  final Color goldLight;

  Color get _ink => Color.lerp(navy, Colors.black, 0.82)!;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.clipRect(rect);
    final center = anchor.alongSize(size);
    final line = Paint()
      ..style = PaintingStyle.stroke
      ..isAntiAlias = true;

    switch (variant) {
      case 1:
        // Navy fading to ink, gold pinstripes, a warm glow behind the glyph.
        canvas.drawRect(
          rect,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [navy, _ink],
            ).createShader(rect),
        );
        line
          ..color = gold.withValues(alpha: 0.10)
          ..strokeWidth = 1;
        for (var x = -size.height; x < size.width; x += 14) {
          canvas.drawLine(
            Offset(x, size.height),
            Offset(x + size.height, 0),
            line,
          );
        }
        _glow(canvas, center, size.shortestSide * 0.6, 0.30);
        canvas.drawLine(
          Offset(0, size.height - 1.5),
          Offset(size.width, size.height - 1.5),
          Paint()
            ..color = gold.withValues(alpha: 0.7)
            ..strokeWidth = 3,
        );
      case 2:
        // Ink with concentric gold rings around the glyph.
        canvas.drawRect(rect, Paint()..color = _ink);
        _glow(canvas, center, size.shortestSide * 0.45, 0.22);
        final step = math.max<double>(size.shortestSide * 0.085, 10);
        final far = size.longestSide * 1.2;
        var i = 0;
        for (var r = step * 2.2; r < far; r += step, i++) {
          line
            ..color = gold.withValues(alpha: math.max(0.05, 0.55 - i * 0.06))
            ..strokeWidth = i == 0 ? 2 : 1;
          canvas.drawCircle(center, r, line);
        }
        canvas
          ..drawCircle(center, step * 2.2, Paint()..color = navy)
          ..drawCircle(
            center,
            step * 2.2,
            line
              ..color = gold
              ..strokeWidth = 2,
          );
      case 3:
        // A notary-style scalloped seal on a navy vignette, dot grid.
        canvas.drawRect(
          rect,
          Paint()
            ..shader = RadialGradient(
              center: anchor,
              radius: 1.1,
              colors: [Color.lerp(navy, gold, 0.10)!, navy, _ink],
              stops: const [0, 0.45, 1],
            ).createShader(rect),
        );
        _dots(canvas, size, 16, 0.14);
        final r = size.shortestSide * 0.36;
        final seal = Path();
        const points = 28;
        for (var k = 0; k <= points * 2; k++) {
          final a = math.pi * k / points;
          final rr = k.isEven ? r : r * 0.9;
          final p = center + Offset(math.cos(a) * rr, math.sin(a) * rr);
          if (k == 0) {
            seal.moveTo(p.dx, p.dy);
          } else {
            seal.lineTo(p.dx, p.dy);
          }
        }
        seal.close();
        canvas
          ..drawPath(seal, Paint()..color = Color.lerp(navy, gold, 0.22)!)
          ..drawPath(
            seal,
            line
              ..color = goldLight
              ..strokeWidth = 1.5,
          )
          ..drawCircle(
            center,
            r * 0.74,
            Paint()
              ..style = PaintingStyle.stroke
              ..color = gold.withValues(alpha: 0.8)
              ..strokeWidth = 1,
          );
      default:
        // Icon avatar background.
        canvas.drawRect(
          rect,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [navy, _ink],
            ).createShader(rect),
        );
        _dots(canvas, size, 18, 0.10);
        _glow(canvas, center, size.shortestSide * 0.7, 0.18);
    }
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

  void _dots(Canvas canvas, Size size, double gap, double alpha) {
    final dot = Paint()..color = gold.withValues(alpha: alpha);
    for (var y = gap / 2; y < size.height; y += gap) {
      for (var x = gap / 2; x < size.width; x += gap) {
        canvas.drawCircle(Offset(x, y), 1.1, dot);
      }
    }
  }

  @override
  bool shouldRepaint(_CoverPainter old) =>
      old.variant != variant ||
      old.anchor != anchor ||
      old.navy != navy ||
      old.gold != gold;
}
