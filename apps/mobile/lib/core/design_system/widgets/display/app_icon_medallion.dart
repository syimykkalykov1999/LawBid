import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';

/// Tone of an [AppIconMedallion].
enum AppMedallionTone { gold, danger, success, neutral }

/// Circular tinted badge holding an icon (UI modernization pass,
/// 2026-09-27) — the "seal" motif used by settings rows, device cards and
/// empty/error/offline states. A thin ring in the tone color echoes the
/// gold stroke of the scales logo without redrawing it. Decorative: wrapped
/// in [ExcludeSemantics]; the surrounding row/state carries the label.
class AppIconMedallion extends StatelessWidget {
  const AppIconMedallion({
    required this.icon,
    super.key,
    this.tone = AppMedallionTone.gold,
    this.size = AppSizes.rowMedallion,
    this.iconSize = AppSizes.iconSm,
  });

  final IconData icon;
  final AppMedallionTone tone;
  final double size;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final (fill, foreground) = switch (tone) {
      AppMedallionTone.gold => (colors.goldTint, colors.goldStroke),
      AppMedallionTone.danger => (colors.dangerTint, colors.danger),
      AppMedallionTone.success => (colors.successTint, colors.success),
      AppMedallionTone.neutral => (colors.bg, colors.textSecondary),
    };
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: fill,
          shape: BoxShape.circle,
          border: Border.all(color: foreground.withValues(alpha: 0.35)),
        ),
        alignment: Alignment.center,
        child: AppIcon(icon, size: iconSize, color: foreground),
      ),
    );
  }
}
