import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../tokens/app_radii.dart';
import '../../tokens/app_spacing.dart';

/// General-purpose card container (file 01 §15 component list): `surface`
/// fill, 1px `border`, default padding on the 4px grid. Role selection uses
/// [RoleCard] instead (a distinct, more specific spec — file 07 §4).
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.roleCard),
        border: Border.all(color: colors.border),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return GestureDetector(onTap: onTap, behavior: HitTestBehavior.opaque, child: card);
  }
}
