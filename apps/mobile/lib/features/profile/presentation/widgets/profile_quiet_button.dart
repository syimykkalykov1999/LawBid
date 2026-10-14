import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Instagram-style secondary button: soft fill, no icon, small type.
class ProfileQuietButton extends StatelessWidget {
  const ProfileQuietButton({
    required this.label,
    required this.onTap,
    this.loading = false,
    super.key,
  });

  // Owner 2026-10-13: Follow, Message and Offer a case share one height.
  static const double height = 32;

  final String label;
  final VoidCallback onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        // Fixed height; a long translation shrinks to fit (owner
        // 2026-10-05: buttons keep their size and place).
        child: Container(
          height: height,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.field),
            border: Border.all(color: colors.border),
          ),
          child: loading
              ? SizedBox.square(
                  dimension: AppSizes.iconSm,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.text,
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xs,
                  ),
                  child: FitText(
                    label,
                    textAlign: TextAlign.center,
                    style: typography.button
                        .copyWith(fontSize: 14, color: colors.text),
                  ),
                ),
        ),
      ),
    );
  }
}
