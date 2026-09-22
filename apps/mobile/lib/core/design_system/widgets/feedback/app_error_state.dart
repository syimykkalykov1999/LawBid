import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';
import '../../tokens/app_spacing.dart';
import '../buttons/app_button.dart';

/// Error-state placeholder with a "Повторить" (Retry) action (file 01 §15;
/// `.cursorrules` requires "error+Повторить" on every screen). Uses a plain
/// [AppButton], not [GavelStrikeButton] — the gavel animation is reserved
/// for the specific primary actions listed in file 07 §7.4, which retry
/// buttons are not part of.
class AppErrorState extends StatelessWidget {
  const AppErrorState({
    super.key,
    required this.message,
    required this.onRetry,
    this.retryLabel = 'Повторить',
  });

  final String message;
  final VoidCallback onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 40, color: colors.danger),
            const SizedBox(height: AppSpacing.md),
            Text(
              message,
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: 160,
              child: AppButton(
                label: retryLabel,
                variant: AppButtonVariant.secondary,
                onPressed: onRetry,
                height: 44,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
