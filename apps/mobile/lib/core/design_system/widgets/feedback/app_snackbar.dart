import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';

/// Floating, rounded, inverse-colored snackbar with a gold info glyph
/// (UI modernization pass, 2026-09-27). Opt-in per call site rather than a
/// global `snackBarTheme`, so the welcome screen's snackbar is unchanged.
///
/// [actionLabel] + [onAction]: a gold text button (e.g. "Undo", owner
/// 2026-10-01 — a checkmark set by mistake can be taken back at once).
void showAppSnackBar(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
}) {
  // Owner 2026-10-19 («нажимаю на оплату — ничего»): a snackbar lives in the
  // screen's Scaffold, UNDER a bottom sheet or a dialog, so an error from a
  // sheet (the boost's «Оплатить», a checkout) was never seen. From a sheet
  // or a dialog the message shows above everything instead.
  if (ModalRoute.of(context) is PopupRoute) {
    _showOverlayMessage(
      context,
      message,
      actionLabel: actionLabel,
      onAction: onAction,
    );
    return;
  }
  _showScaffoldSnackBar(
    context,
    message,
    actionLabel: actionLabel,
    onAction: onAction,
  );
}

OverlayEntry? _overlayMessage;

void _showOverlayMessage(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
}) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final typography = Theme.of(context).extension<AppTypographyTokens>()!;
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  _overlayMessage?.remove();
  late final OverlayEntry entry;
  void close() {
    if (identical(_overlayMessage, entry)) _overlayMessage = null;
    if (entry.mounted) entry.remove();
  }

  entry = OverlayEntry(
    builder: (context) {
      final mq = MediaQuery.of(context);
      return Positioned(
        left: AppSpacing.lg,
        right: AppSpacing.lg,
        bottom: AppSpacing.lg + mq.viewInsets.bottom + mq.padding.bottom,
        child: Material(
          key: const ValueKey('app-overlay-message'),
          color: colors.text,
          elevation: 6,
          borderRadius: BorderRadius.circular(AppRadii.field),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.md,
            ),
            child: Row(
              children: [
                AppIcon(
                  AppIcons.infoOutlineRounded,
                  size: AppSizes.iconSm,
                  color: colors.gold,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    message,
                    style: typography.body.copyWith(color: colors.inverseText),
                  ),
                ),
                if (actionLabel != null && onAction != null)
                  TextButton(
                    onPressed: () {
                      close();
                      onAction();
                    },
                    child: Text(
                      actionLabel,
                      style: typography.body.copyWith(color: colors.gold),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    },
  );
  _overlayMessage = entry;
  overlay.insert(entry);
  Future<void>.delayed(const Duration(seconds: 4), close);
}

void _showScaffoldSnackBar(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
}) {
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
        action: actionLabel == null || onAction == null
            ? null
            : SnackBarAction(
                label: actionLabel,
                textColor: colors.gold,
                onPressed: onAction,
              ),
        content: Row(
          children: [
            AppIcon(
              AppIcons.infoOutlineRounded,
              size: AppSizes.iconSm,
              color: colors.gold,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                message,
                style: typography.body.copyWith(color: colors.inverseText),
              ),
            ),
          ],
        ),
      ),
    );
}
