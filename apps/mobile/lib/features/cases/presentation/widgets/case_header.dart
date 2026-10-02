import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';

/// Top of a case detail: practice (gold caption), serif title, status and
/// place/date line. Staggers in.
class CaseHeader extends StatelessWidget {
  const CaseHeader({
    required this.practice,
    required this.title,
    required this.status,
    required this.meta,
    required this.t,
    this.extra,
    super.key,
  });

  final String practice;
  final String title;
  final CaseStatus status;
  final String meta;
  final Translator t;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppEntrance(
          child: Row(
            children: [
              AppIcon(
                AppIcons.balanceRounded,
                size: AppSpacing.lg,
                color: colors.goldDark,
              ),
              const SizedBox(width: AppSpacing.xs + 2),
              Expanded(
                child: Text(
                  practice,
                  style: typography.bodySmall.copyWith(
                    color: colors.goldDark,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppEntrance(
          index: 1,
          child: Semantics(
            header: true,
            child: Text(
              title,
              style: typography.titleLarge.copyWith(color: colors.text),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppEntrance(
          index: 2,
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              CaseStatusPill(status: status, t: t),
              Text(
                meta,
                style:
                    typography.bodySmall.copyWith(color: colors.textSecondary),
              ),
              if (extra != null) extra!,
            ],
          ),
        ),
      ],
    );
  }
}

/// A tinted notice (pending completion, archive, locked contacts…).
class NoticeCard extends StatelessWidget {
  const NoticeCard({
    required this.icon,
    required this.message,
    this.tone = StatusTone.gold,
    this.action,
    super.key,
  });

  final IconData icon;
  final String message;
  final StatusTone tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (fg, bg) = switch (tone) {
      StatusTone.danger => (colors.dangerText, colors.dangerTint),
      StatusTone.success => (colors.success, colors.successTint),
      StatusTone.info => (colors.info, colors.infoTint),
      _ => (colors.goldDark, colors.goldTint),
    };
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIcon(icon, color: fg, size: AppSizes.iconSm),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  message,
                  style: typography.bodySmall.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
          if (action != null) ...[
            const SizedBox(height: AppSpacing.md),
            action!,
          ],
        ],
      ),
    );
  }
}

/// Bottom-sheet menu of case actions (edit / close / delete).
class ActionSheetItem {
  const ActionSheetItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;
}

Future<void> showActionSheet(
  BuildContext context,
  List<ActionSheetItem> items,
) =>
    showAppBottomSheet<void>(
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
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AppSheetHandle(),
                const SizedBox(height: AppSpacing.md),
                for (final item in items)
                  Semantics(
                    button: true,
                    label: item.label,
                    excludeSemantics: true,
                    child: AppPressable(
                      onTap: () {
                        Navigator.of(context).pop();
                        item.onTap();
                      },
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          minHeight: AppSizes.hitTarget + AppSpacing.sm,
                        ),
                        child: Row(
                          children: [
                            AppIconMedallion(
                              icon: item.icon,
                              tone: item.destructive
                                  ? AppMedallionTone.danger
                                  : AppMedallionTone.gold,
                            ),
                            const SizedBox(width: AppSpacing.md),
                            Expanded(
                              child: Text(
                                item.label,
                                style: typography.body.copyWith(
                                  color: item.destructive
                                      ? colors.dangerText
                                      : colors.text,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
