import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/shared/presentation/raised_sheet.dart';

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
      isScrollControlled: true,
      builder: (context) {
        final colors = Theme.of(context).extension<AppColorTokens>()!;
        final typography = Theme.of(context).extension<AppTypographyTokens>()!;
        // Owner 2026-10-24: the same raised, roomy sheet as every «Мои» menu.
        return RaisedSheetBody(
          children: [
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
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.screenSide,
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
              ),
          ],
        );
      },
    );
