import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/widgets/buttons/app_button.dart';
import 'package:lawbid/core/design_system/widgets/display/app_icon_medallion.dart';
import 'package:lawbid/core/design_system/widgets/feedback/app_state_layout.dart';

/// Error-state placeholder with a "Повторить" (Retry) action (file 01 §15;
/// `.cursorrules` requires "error+Повторить" on every screen). Uses a plain
/// [AppButton], not `GavelStrikeButton` — the gavel animation is reserved
/// for the specific primary actions listed in file 07 §7.4, which retry
/// buttons are not part of.
class AppErrorState extends StatelessWidget {
  const AppErrorState({
    required this.message,
    required this.onRetry,
    super.key,
    this.title,
    this.retryLabel = 'Повторить',
  });

  final String message;
  final String? title;
  final VoidCallback onRetry;

  /// Callers pass `t('error.retry')`; the default only exists for
  /// backwards compatibility with pre-i18n call sites.
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    return AppStateLayout(
      icon: AppIcons.errorOutlineRounded,
      tone: AppMedallionTone.danger,
      title: title,
      message: message,
      action: AppButton(
        label: retryLabel,
        icon: AppIcons.refreshRounded,
        variant: AppButtonVariant.secondary,
        onPressed: onRetry,
        height: AppSizes.touchTarget,
      ),
    );
  }
}
