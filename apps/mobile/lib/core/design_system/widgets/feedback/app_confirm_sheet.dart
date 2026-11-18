import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:material_ui/material_ui.dart';

/// A confirmation bottom sheet; resolves to true on confirm.
Future<bool> showConfirmSheet(
  BuildContext context, {
  required Translator t,
  required String title,
  required String message,
  required String confirmLabel,
  bool destructive = false,
}) async {
  final result = await showAppBottomSheet<bool>(
    context: context,
    builder: (context) {
      final colors = Theme.of(context).extension<AppColorTokens>()!;
      final typography = Theme.of(context).extension<AppTypographyTokens>()!;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AppSheetHandle(),
                const SizedBox(height: AppSpacing.lg),
                AppIconMedallion(
                  icon: destructive
                      ? AppIcons.warningAmberRounded
                      : AppIcons.gavelRounded,
                  tone: destructive
                      ? AppMedallionTone.danger
                      : AppMedallionTone.gold,
                  size: AppSizes.stateMedallion * 0.6,
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: typography.body.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.xl),
                AppButton(
                  label: confirmLabel,
                  onPressed: () => Navigator.of(context).pop(true),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: t.t('common.cancel'),
                  variant: AppButtonVariant.secondary,
                  onPressed: () => Navigator.of(context).pop(false),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
  return result ?? false;
}
