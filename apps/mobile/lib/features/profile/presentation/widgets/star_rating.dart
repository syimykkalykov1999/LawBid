import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Read-only stars with halves (docs/03 §7.4: "звёзды с половинками").
/// With [animate] the stars fill one after another (short stagger, ≤ 0.5 s
/// in total); under reduce-motion they render filled immediately. The
/// whole row is one image for screen readers ([semanticLabel]).
class StarRatingDisplay extends StatelessWidget {
  const StarRatingDisplay({
    required this.value,
    super.key,
    this.size = AppSizes.iconSm,
    this.color,
    this.emptyColor,
    this.animate = false,
    this.semanticLabel,
  });

  /// 0..5; 0 = no reviews (all empty).
  final double value;
  final double size;
  final Color? color;
  final Color? emptyColor;
  final bool animate;
  final String? semanticLabel;

  /// Rounds to the nearest half (4.3 → 4.5, 4.2 → 4.0).
  static double toHalves(double v) => (v * 2).round() / 2;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final fill = color ?? colors.gold;
    final empty = emptyColor ?? colors.border;
    final rounded = toHalves(value.clamp(0, 5).toDouble());
    final reduce = context.reduceMotion || !animate;

    Widget star(int i) {
      final IconData icon;
      if (rounded >= i + 1) {
        icon = Icons.star_rounded;
      } else if (rounded >= i + 0.5) {
        icon = Icons.star_half_rounded;
      } else {
        icon = Icons.star_outline_rounded;
      }
      final filled = icon != Icons.star_outline_rounded;
      final glyph = Icon(icon, size: size, color: filled ? fill : empty);
      if (reduce || !filled) return glyph;
      return TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: AppMotion.entrance + AppMotion.entranceStagger * i,
        curve: Interval(i * 0.12, 1, curve: AppMotion.enterCurve),
        builder: (context, t, child) => Opacity(
          opacity: t,
          child: Transform.scale(scale: 0.6 + 0.4 * t, child: child),
        ),
        child: glyph,
      );
    }

    return Semantics(
      label: semanticLabel,
      image: semanticLabel != null,
      excludeSemantics: true,
      child: RepaintBoundary(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [for (var i = 0; i < 5; i++) star(i)],
        ),
      ),
    );
  }
}

/// Interactive 1–5 star picker for the review form (docs/03 §7.2). Each
/// star is a 48 px target; the selected star gets a short "pop". Exposed
/// to screen readers as five selectable buttons.
class StarRatingInput extends StatelessWidget {
  const StarRatingInput({
    required this.value,
    required this.onChanged,
    required this.starLabel,
    super.key,
    this.enabled = true,
  });

  final int value;
  final ValueChanged<int> onChanged;

  /// "4 stars" label for star `n`.
  final String Function(int n) starLabel;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final reduce = context.reduceMotion;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var n = 1; n <= 5; n++)
          Semantics(
            button: true,
            selected: n == value,
            inMutuallyExclusiveGroup: true,
            label: starLabel(n),
            excludeSemantics: true,
            onTap: enabled ? () => onChanged(n) : null,
            child: GestureDetector(
              key: ValueKey('star-input-$n'),
              behavior: HitTestBehavior.opaque,
              onTap: enabled ? () => onChanged(n) : null,
              child: SizedBox.square(
                dimension: AppSizes.hitTarget,
                child: Center(
                  child: AnimatedScale(
                    scale: n == value && !reduce ? 1.18 : 1,
                    duration: reduce ? Duration.zero : AppMotion.stateChange,
                    curve: AppMotion.enterCurve,
                    child: AnimatedSwitcher(
                      duration: reduce ? Duration.zero : AppMotion.stateChange,
                      child: Icon(
                        n <= value
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        key: ValueKey(n <= value),
                        size: AppSizes.iconLg + AppSpacing.sm,
                        color: n <= value ? colors.gold : colors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
