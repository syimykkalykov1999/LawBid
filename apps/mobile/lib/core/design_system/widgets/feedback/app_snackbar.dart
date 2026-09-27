import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';

/// Floating, rounded, inverse-colored snackbar with a gold info glyph
/// (UI modernization pass, 2026-09-27). Opt-in per call site rather than a
/// global `snackBarTheme`, so the welcome screen's snackbar is unchanged.
void showAppSnackBar(BuildContext context, String message) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final typography = Theme.of(context).extension<AppTypographyTokens>()!;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: colors.text,
        margin: const EdgeInsets.all(AppSpacing.lg),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
        ),
        content: Row(
          children: [
            Icon(
              Icons.info_outline_rounded,
              size: AppSizes.iconSm,
              color: colors.gold,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                message,
                style: typography.body.copyWith(color: colors.bg),
              ),
            ),
          ],
        ),
      ),
    );
}
