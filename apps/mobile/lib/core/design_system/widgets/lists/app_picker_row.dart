import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_pressable.dart';

/// A row of a picker sheet (languages, themes): rounded card, the chosen one
/// with a gold border, a gold tint and a check. Owner 2026-10-13: the theme
/// sheet is the language sheet's twin, so both use this one widget.
class AppPickerRow extends StatelessWidget {
  const AppPickerRow({
    required this.title,
    required this.selected,
    required this.onTap,
    this.subtitle,
    this.leading,
    this.trailing,
    this.semanticLabel,
    super.key,
  });

  final String title;
  final String? subtitle;

  /// Before the title (a theme's swatch).
  final Widget? leading;

  /// Shown when not selected (a language's code); a check replaces it.
  final Widget? trailing;
  final bool selected;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final enabled = onTap != null;
    return Semantics(
      button: enabled,
      enabled: enabled,
      selected: selected,
      label: semanticLabel ?? title,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          curve: AppMotion.enterCurve,
          constraints: const BoxConstraints(
            minHeight: AppSizes.touchTarget + AppSpacing.md,
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: selected ? colors.goldTint : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.field),
            border: Border.all(color: selected ? colors.gold : colors.border),
          ),
          child: Row(
            children: [
              if (leading != null) ...[
                leading!,
                const SizedBox(width: AppSpacing.md),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: typography.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                  ],
                ),
              ),
              if (selected)
                AppIcon(
                  AppIcons.checkCircleRounded,
                  size: AppSizes.iconSm,
                  color: colors.goldStroke,
                )
              else if (trailing != null) ...[
                const SizedBox(width: AppSpacing.sm),
                trailing!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
