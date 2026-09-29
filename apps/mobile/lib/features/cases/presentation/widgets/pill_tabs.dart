import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Horizontal tabs with a gold underline that glides to the selection
/// (in-app modern style, OQ-007). Scrolls when the labels don't fit
/// (200% text).
class PillTabs<T> extends StatelessWidget {
  const PillTabs({
    required this.value,
    required this.tabs,
    required this.onChanged,
    super.key,
  });

  final T value;
  final List<(T, String)> tabs;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
      child: Row(
        children: [
          for (final (key, label) in tabs)
            Semantics(
              button: true,
              selected: key == value,
              label: label,
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onChanged(key),
                child: ConstrainedBox(
                  constraints:
                      const BoxConstraints(minHeight: AppSizes.hitTarget),
                  child: Padding(
                    padding: const EdgeInsets.only(right: AppSpacing.xl),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AnimatedDefaultTextStyle(
                          duration: motion,
                          style: typography.button.copyWith(
                            color: key == value
                                ? colors.text
                                : colors.textSecondary,
                          ),
                          child: Text(label),
                        ),
                        const SizedBox(height: AppSpacing.xs + 2),
                        AnimatedContainer(
                          duration: motion,
                          curve: AppMotion.enterCurve,
                          height: 2,
                          width: key == value ? AppSpacing.xl : 0,
                          decoration: BoxDecoration(
                            color: colors.gold,
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Filter chips row (Active / Archive / Closed …).
class FilterChips<T> extends StatelessWidget {
  const FilterChips({
    required this.value,
    required this.options,
    required this.onChanged,
    super.key,
  });

  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
        child: Row(
          children: [
            for (final (key, label) in options) ...[
              AppChip(
                  label: label,
                  selected: key == value,
                  onTap: () => onChanged(key)),
              const SizedBox(width: AppSpacing.sm),
            ],
          ],
        ),
      );
}
