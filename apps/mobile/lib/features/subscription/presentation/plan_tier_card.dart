import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-10-01 (subscription redesign): one card per plan — the
/// status at the top right ("Active" / "Selected" / a badge), the price,
/// what the plan includes and, inside the card, its own controls
/// (assistants, the team, switching). Brand navy + gold only.
class PlanTierCard extends StatelessWidget {
  const PlanTierCard({
    required this.title,
    required this.price,
    required this.period,
    required this.features,
    this.icon = AppIcons.workspacePremiumOutlined,
    this.status,
    this.statusFilled = false,
    this.highlighted = false,
    this.onTap,
    this.child,
    super.key,
  });

  final String title;
  final IconData icon;

  /// "$399" — the big number.
  final String price;

  /// "per month" — next to the number.
  final String period;
  final List<String> features;

  /// Top right: "Active" (filled gold) or a badge / "Selected" (outlined).
  final String? status;
  final bool statusFilled;

  /// Gold border: the active or the selected plan.
  final bool highlighted;

  /// Picking a plan before paying; null when the card is not selectable.
  final VoidCallback? onTap;

  /// The plan's own controls, inside the card under the features.
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final card = AnimatedContainer(
      duration: dur,
      curve: Curves.easeOutCubic,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(
          color: highlighted ? colors.gold : colors.border,
          width: highlighted ? 1.8 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: highlighted
                ? colors.gold.withValues(alpha: 0.18)
                : colors.shadow,
            blurRadius: highlighted ? 18 : 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: colors.navy,
                  borderRadius: BorderRadius.circular(11),
                  border:
                      Border.all(color: colors.gold.withValues(alpha: 0.55)),
                ),
                child: AppIcon(icon, size: 19, color: colors.gold),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  title,
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
              if (status != null)
                AnimatedContainer(
                  key: ValueKey('plan-status-$status'),
                  duration: dur,
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm + 2,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: statusFilled ? colors.gold : Colors.transparent,
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                    border: Border.all(color: colors.gold),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (statusFilled) ...[
                        const AppIcon(
                          AppIcons.checkRounded,
                          size: 14,
                          color: AppColorsLight.navy,
                        ),
                        const SizedBox(width: 4),
                      ],
                      Text(
                        status!,
                        style: typography.caption.copyWith(
                          color: statusFilled
                              ? AppColorsLight.navy
                              : colors.goldDark,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: price,
                  style: typography.titleLarge.copyWith(
                    color: colors.text,
                    fontSize: 30,
                    height: 1.1,
                  ),
                ),
                TextSpan(
                  text: '  $period',
                  style: typography.body.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          for (final f in features)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: AppIcon(
                      AppIcons.checkRounded,
                      size: 16,
                      color: colors.goldDark,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      f,
                      style: typography.bodySmall.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
            ),
          if (child != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Divider(height: 1, color: colors.border),
            const SizedBox(height: AppSpacing.md),
            child!,
          ],
        ],
      ),
    );
    if (onTap == null) return card;
    return Semantics(
      button: true,
      selected: highlighted,
      label: '$title, $price $period',
      child: AppPressable(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap!();
        },
        child: card,
      ),
    );
  }
}

/// Inside the monthly card: "Add an assistant · +$100/month" while there
/// are none, then the count with − / + and the monthly total.
class AssistantSeatsControl extends StatelessWidget {
  const AssistantSeatsControl({
    required this.t,
    required this.seats,
    required this.max,
    required this.seatPrice,
    required this.total,
    required this.onChanged,
    this.min = 0,
    super.key,
  });

  final Translator t;
  final int seats;
  final int min;
  final int max;

  /// "$100".
  final String seatPrice;

  /// "$599 per month".
  final String total;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    if (seats == 0) {
      return AppButton(
        key: const ValueKey('seats-add-first'),
        label: t.t('plans.assistants.add', {'price': seatPrice}),
        icon: AppIcons.personAddAlt1Rounded,
        variant: AppButtonVariant.secondary,
        onPressed: max > 0 ? () => onChanged(1) : null,
      );
    }
    // ignore: avoid_positional_boolean_parameters
    Widget round(IconData icon, bool enabled, int to, String key) {
      final plus = icon == AppIcons.addRounded;
      return Semantics(
        button: true,
        enabled: enabled,
        label: plus ? '+' : '−',
        child: AppPressable(
          key: ValueKey(key),
          onTap: enabled
              ? () {
                  HapticFeedback.selectionClick();
                  onChanged(to);
                }
              : null,
          child: SizedBox(
            width: AppSizes.touchTarget,
            height: AppSizes.touchTarget,
            child: Center(
              child: AnimatedOpacity(
                duration: AppMotion.stateChange,
                opacity: enabled ? 1 : 0.35,
                child: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: plus ? colors.gold : Colors.transparent,
                    border: Border.all(color: colors.gold),
                  ),
                  child: AppIcon(
                    icon,
                    size: 18,
                    color: plus ? AppColorsLight.navy : colors.text,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    t.t('plans.assistants.count', {'n': '$seats'}),
                    style: typography.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    t.t('plans.assistants.each', {'price': seatPrice}),
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            round(
              AppIcons.removeRounded,
              seats > min,
              seats - 1,
              'seats-minus',
            ),
            SizedBox(
              width: 26,
              child: Text(
                '$seats',
                key: const ValueKey('seats-value'),
                textAlign: TextAlign.center,
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
            ),
            round(AppIcons.addRounded, seats < max, seats + 1, 'seats-plus'),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Expanded(
              child: Text(
                t.t('plans.total.label'),
                style:
                    typography.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ),
            Text(
              total,
              key: const ValueKey('plan-total'),
              style: typography.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
