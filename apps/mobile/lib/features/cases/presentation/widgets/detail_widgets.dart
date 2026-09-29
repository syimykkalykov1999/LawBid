import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Section title in the brand serif with a short gold rule.
class DetailSection extends StatelessWidget {
  const DetailSection({
    required this.title,
    required this.child,
    this.trailing,
    super.key,
  });

  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    title,
                    style: typography.roleTitle.copyWith(color: colors.text),
                  ),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              width: AppSpacing.xl,
              height: 2,
              decoration: BoxDecoration(
                color: colors.gold,
                borderRadius: BorderRadius.circular(AppRadii.pill),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          child,
        ],
      ),
    );
  }
}

/// Icon + label + value row for case facts (budget, states, dates).
class InfoRow extends StatelessWidget {
  const InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    super.key,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      label: '$label: $value',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: AppSizes.iconSm, color: colors.goldDark),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: typography.body.copyWith(color: colors.text),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Grid-free fact card: rows separated by hairlines.
class FactsCard extends StatelessWidget {
  const FactsCard({required this.rows, super.key});

  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AppCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 1, color: colors.border),
            rows[i],
          ],
        ],
      ),
    );
  }
}

/// Sticky bottom bar for the screen's actions, above the home indicator.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    if (children.isEmpty) return const SizedBox.shrink();
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) const SizedBox(height: AppSpacing.sm),
                children[i],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Two buttons side by side (e.g. Decline | Counter).
class ButtonPair extends StatelessWidget {
  const ButtonPair({required this.left, required this.right, super.key});

  final Widget left;
  final Widget right;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(child: left),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: right),
        ],
      );
}

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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.lg),
              AppIconMedallion(
                icon: destructive
                    ? Icons.warning_amber_rounded
                    : Icons.gavel_rounded,
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
      );
    },
  );
  return result ?? false;
}

/// Page padding shared by detail screens.
const EdgeInsets kDetailPadding = EdgeInsets.fromLTRB(
  AppSpacing.screenSide,
  AppSpacing.lg,
  AppSpacing.screenSide,
  AppSpacing.xxl,
);

/// A 44px icon action for the top bar (48px touch area).
class TopBarIcon extends StatelessWidget {
  const TopBarIcon({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AppTapTarget(
      child: Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: AppPressable(
          onTap: onTap,
          child: SizedBox.square(
            dimension: AppSizes.touchTarget,
            child: Icon(
              icon,
              color: color ?? colors.text,
              size: AppSizes.iconMd,
            ),
          ),
        ),
      ),
    );
  }
}
