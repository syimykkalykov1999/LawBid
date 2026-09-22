import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';

/// Circular avatar (file 01 §15 component list): image when [imageUrl] is
/// given, otherwise initials on a `surface`-tinted circle. No network image
/// loading logic here (that's the data layer's job in later stages) — this
/// widget only lays out whatever [ImageProvider] it's handed.
class AppAvatar extends StatelessWidget {
  const AppAvatar({
    super.key,
    this.imageProvider,
    this.initials,
    this.size = 40,
    this.semanticLabel,
  });

  final ImageProvider? imageProvider;
  final String? initials;
  final double size;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    return Semantics(
      image: imageProvider != null,
      label: semanticLabel,
      child: CircleAvatar(
        radius: size / 2,
        backgroundColor: colors.border,
        backgroundImage: imageProvider,
        child: imageProvider == null && initials != null
            ? Text(
                initials!,
                style: typography.body.copyWith(color: colors.textSecondary, fontSize: size * 0.38),
              )
            : null,
      ),
    );
  }
}
