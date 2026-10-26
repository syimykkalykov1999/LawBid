import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_pressable.dart';

/// Owner 2026-10-23: the small green pill of a running call («Join» /
/// «Return») in the Calls tab and in the sheet above Chats. A 44 dp touch
/// area around a pill in the success colour; a long word shrinks to «…».
class AppSuccessPill extends StatelessWidget {
  const AppSuccessPill({
    required this.label,
    required this.onPressed,
    this.busy = false,
    super.key,
  });

  final String label;
  final VoidCallback onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: busy ? null : onPressed,
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: AppSizes.touchTarget,
            maxWidth: 124,
          ),
          child: Center(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colors.success,
                borderRadius: BorderRadius.circular(AppRadii.pill),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: busy
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
