import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// A required consent as a selectable card, in the visual language of the
/// role cards (docs/07 §4 RoleCard: surface card, gold border and gold
/// check badge when selected, press scale). Owner decision 2026-09-27: the
/// consents step uses cards like the role choice. Unlike RoleCard it is a
/// checkbox (independent toggles), not a radio group.
class ConsentCard extends StatelessWidget {
  const ConsentCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.value,
    required this.onChanged,
    super.key,
    this.showError = false,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool value;
  final ValueChanged<bool> onChanged;

  /// Required but not accepted after the user tried to continue.
  final bool showError;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final borderColor = value
        ? colors.gold
        : showError
            ? colors.danger
            : colors.border;

    return Semantics(
      checked: value,
      label: title,
      hint: description,
      child: AppPressable(
        onTap: () => onChanged(!value),
        child: ExcludeSemantics(
          child: Stack(
            children: [
              AnimatedContainer(
                duration: context.reduceMotion
                    ? Duration.zero
                    : AppMotion.stateChange,
                curve: AppMotion.enterCurve,
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.roleCard),
                  border: Border.all(
                    color: borderColor,
                    width: value || showError ? 1.5 : 1,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        AppIcon(
                          icon,
                          size: AppSizes.iconSm,
                          color: colors.gold,
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Text(
                            title,
                            style: typography.roleTitle
                                .copyWith(color: colors.text),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Padding(
                      padding: const EdgeInsets.only(right: AppSpacing.xl),
                      child: Text(
                        description,
                        style: typography.bodySmall
                            .copyWith(color: colors.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                right: AppSpacing.md,
                bottom: AppSpacing.md,
                child: AnimatedContainer(
                  duration: context.reduceMotion
                      ? Duration.zero
                      : AppMotion.roleCardCheckmark,
                  width: AppSizes.iconSm,
                  height: AppSizes.iconSm,
                  decoration: BoxDecoration(
                    color: value ? colors.gold : colors.surface,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: value
                          ? colors.gold
                          : showError
                              ? colors.danger
                              : colors.border,
                      width: 1.5,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: value
                      ? AppIcon(
                          AppIcons.check,
                          size: AppSizes.iconSm * 0.65,
                          color: colors.navy,
                        )
                      : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
