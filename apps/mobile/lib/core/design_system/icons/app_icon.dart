import 'package:flutter/material.dart';

/// The app's icon widget (replaces [Icon]): one place to style every
/// glyph. Phosphor Light lines take the theme's icon colour — no fills,
/// no extra colours.
class AppIcon extends StatelessWidget {
  const AppIcon(
    this.icon, {
    super.key,
    this.size,
    this.color,
    this.semanticLabel,
    this.shadows,
  });

  final IconData? icon;
  final double? size;
  final Color? color;
  final String? semanticLabel;
  final List<Shadow>? shadows;

  @override
  Widget build(BuildContext context) => Icon(
        icon,
        size: size,
        color: color,
        semanticLabel: semanticLabel,
        shadows: shadows,
      );
}
