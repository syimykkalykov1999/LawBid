import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';

/// Blurs what is behind [child] when the theme is Glass (owner 2026-10-13);
/// in every other theme it is the child as it is. Wrap a panel (card, bar,
/// sheet) that already has its translucent `surface` fill and its radius.
class GlassPanel extends StatelessWidget {
  const GlassPanel({
    required this.child,
    this.radius = BorderRadius.zero,
    super.key,
  });

  final Widget child;
  final BorderRadius radius;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    if (!colors.isGlass) return child;
    return ClipRRect(
      borderRadius: radius,
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: colors.panelBlur,
          sigmaY: colors.panelBlur,
        ),
        child: child,
      ),
    );
  }
}

/// The picture behind the whole app: the Glass gradient with its soft light
/// spots; nothing (the plain `bg`) for the other themes.
class AppBackdrop extends StatelessWidget {
  const AppBackdrop({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final gradient = colors.bgGradient;
    if (gradient == null) return child;
    final spots = colors.bgSpots;
    return Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: const Alignment(-0.34, -1),
              end: const Alignment(0.34, 1),
              colors: gradient,
              stops: const [0, 0.6, 1],
            ),
          ),
        ),
        if (spots.length >= 3) ...[
          _Spot(
            color: spots[0],
            alignment: const Alignment(-0.64, -0.76),
            radius: 0.72,
          ),
          _Spot(
            color: spots[1],
            alignment: const Alignment(0.76, -0.24),
            radius: 0.8,
          ),
          _Spot(
            color: spots[2],
            alignment: const Alignment(-0.4, 0.7),
            radius: 0.76,
          ),
        ],
        child,
      ],
    );
  }
}

class _Spot extends StatelessWidget {
  const _Spot({
    required this.color,
    required this.alignment,
    required this.radius,
  });

  final Color color;
  final Alignment alignment;
  final double radius;

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: alignment,
              radius: radius,
              colors: [color, color.withValues(alpha: 0)],
            ),
          ),
        ),
      );
}
