import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_pressable.dart';

/// General-purpose card container (file 01 §15 component list): `surface`
/// fill, 1px `border`, default padding on the 4px grid. Role selection uses
/// `RoleCard` instead (a distinct, more specific spec — file 07 §4).
///
/// UI modernization pass (2026-09-27): opt-in [elevated] soft shadow, and
/// tappable cards now get the standard press-scale feedback.
class AppCard extends StatelessWidget {
  const AppCard({
    required this.child,
    super.key,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.onTap,
    this.elevated = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
        boxShadow: elevated
            ? [
                BoxShadow(
                  color: colors.shadow,
                  blurRadius: AppSizes.cardShadowBlur,
                  offset: const Offset(0, AppSizes.cardShadowOffsetY),
                ),
              ]
            : null,
      ),
      child: child,
    );
    if (onTap == null) return card;
    return AppPressable(onTap: onTap, child: card);
  }
}
