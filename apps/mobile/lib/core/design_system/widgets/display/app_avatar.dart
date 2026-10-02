import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_fonts.dart';

/// Circular avatar (file 01 §15 component list): image when `imageUrl` is
/// given, otherwise initials on a `surface`-tinted circle. No network image
/// loading logic here (that's the data layer's job in later stages) — this
/// widget only lays out whatever [ImageProvider] it's handed.
///
/// p12 leaf-1.6: initials sit on a navy "seal" with gold-light serif
/// letters and a thin gold ring (the brand's navy + gold pairing, same as
/// the medallions). The previous `textSecondary` on `border` measured
/// 4.35:1 in light theme — below WCAG AA 4.5:1 (docs/01 §8.4); gold-light
/// on navy is 10.4:1 in both themes.
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
      excludeSemantics: semanticLabel != null,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: colors.goldStroke.withValues(alpha: 0.55)),
        ),
        child: CircleAvatar(
          radius: size / 2,
          backgroundColor: colors.navy,
          backgroundImage: imageProvider,
          child: imageProvider == null && initials != null
              ? Text(
                  initials!,
                  maxLines: 1,
                  textScaler: TextScaler.noScaling,
                  style: typography.body.copyWith(
                    color: colors.goldLight,
                    fontFamily: AppFontFamilies.serif,
                    fontWeight: FontWeight.w600,
                    fontSize: size * 0.38,
                  ),
                )
              : null,
        ),
      ),
    );
  }
}
