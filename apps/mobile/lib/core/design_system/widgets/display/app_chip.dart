import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';
import '../../tokens/app_spacing.dart';
import '../motion/app_tap_target.dart';

/// General-purpose pill chip (file 01 §15 component list). File 07 does not
/// give this a standalone spec (only the phone screen's 52px-tall country
/// selector, which is this same widget with `height: 52` and a trailing
/// dropdown arrow — see file 07 §4). Used later for filter/tag chips
/// (feed/search, files 4-5) and here for that country selector.
class AppChip extends StatelessWidget {
  const AppChip({
    super.key,
    required this.label,
    this.leading,
    this.trailing,
    this.onTap,
    this.selected = false,
    this.height = 36,
  });

  final String label;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool selected;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    final chip = Semantics(
      button: onTap != null,
      selected: selected,
      label: label,
      // One clean label (not "DUI\nDUI"); tap re-declared because the
      // GestureDetector's own semantics are excluded with the text.
      excludeSemantics: true,
      onTap: onTap,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          constraints: BoxConstraints(minHeight: height),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(height / 2),
            border: Border.all(color: selected ? colors.gold : colors.border, width: selected ? 1.5 : 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 6)],
              Text(label, style: typography.bodySmall.copyWith(color: colors.text)),
              if (trailing != null) ...[const SizedBox(width: 6), trailing!],
            ],
          ),
        ),
      ),
    );
    // Tappable chips keep their visual height (36 by default) but get a
    // 48px touch/semantics area (docs/01 §8.4, AppTapTarget).
    return onTap == null ? chip : AppTapTarget(child: chip);
  }
}
