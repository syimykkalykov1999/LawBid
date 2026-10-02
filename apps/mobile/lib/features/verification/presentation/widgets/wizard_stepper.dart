import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Wizard progress header (docs/03 §8 "шаги с прогресс-баром"): a gold
/// rail that fills as the attorney advances, numbered medallions (done =
/// check, current = gold ring), the current step name and "Step N of M".
/// Done steps are tappable to jump back. Animated fill honours
/// reduce-motion.
class WizardStepper extends StatelessWidget {
  const WizardStepper({
    required this.labels,
    required this.current,
    required this.stepOfLabel,
    required this.onTapStep,
    super.key,
  });

  final List<String> labels;
  final int current;
  final String stepOfLabel;
  final ValueChanged<int> onTapStep;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stepSwitch;
    final fraction = labels.length <= 1 ? 1.0 : current / (labels.length - 1);

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: AppSizes.hitTarget,
            child: LayoutBuilder(
              builder: (context, box) {
                const dot = AppSizes.rowMedallion - AppSpacing.md; // 28
                const inset = AppSizes.touchTarget / 2;
                final railWidth = box.maxWidth - inset * 2;
                return Stack(
                  alignment: Alignment.centerLeft,
                  children: [
                    Positioned(
                      left: inset,
                      width: railWidth,
                      child: Container(
                        height: 2,
                        color: colors.border,
                      ),
                    ),
                    Positioned(
                      left: inset,
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(end: fraction),
                        duration: duration,
                        curve: AppMotion.enterCurve,
                        builder: (context, v, _) => Container(
                          height: 2,
                          width: railWidth * v,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [colors.goldDark, colors.gold],
                            ),
                          ),
                        ),
                      ),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        for (var i = 0; i < labels.length; i++)
                          _StepDot(
                            index: i,
                            label: labels[i],
                            state: i < current
                                ? _DotState.done
                                : i == current
                                    ? _DotState.current
                                    : _DotState.upcoming,
                            size: dot,
                            duration: duration,
                            onTap: i < current ? () => onTapStep(i) : null,
                          ),
                      ],
                    ),
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                child: AnimatedSwitcher(
                  duration: duration,
                  layoutBuilder: (currentChild, previous) => Stack(
                    alignment: Alignment.centerLeft,
                    children: [
                      ...previous,
                      if (currentChild != null) currentChild,
                    ],
                  ),
                  child: Text(
                    labels[current],
                    key: ValueKey(current),
                    style: typography.caption.copyWith(color: colors.goldDark),
                  ),
                ),
              ),
              Text(
                stepOfLabel,
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

enum _DotState { done, current, upcoming }

class _StepDot extends StatelessWidget {
  const _StepDot({
    required this.index,
    required this.label,
    required this.state,
    required this.size,
    required this.duration,
    required this.onTap,
  });

  final int index;
  final String label;
  final _DotState state;
  final double size;
  final Duration duration;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (fill, border, fg) = switch (state) {
      _DotState.done => (colors.gold, colors.gold, colors.navy),
      _DotState.current => (colors.goldTint, colors.gold, colors.accent),
      _DotState.upcoming => (
          colors.surface,
          colors.border,
          colors.textSecondary
        ),
    };
    final dot = AnimatedContainer(
      duration: duration,
      curve: AppMotion.enterCurve,
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: fill,
        shape: BoxShape.circle,
        border: Border.all(
          color: border,
          width: state == _DotState.current ? 2 : 1.5,
        ),
        boxShadow: state == _DotState.current
            ? [
                BoxShadow(
                  color: colors.focusRingGlow,
                  blurRadius: AppSpacing.sm,
                ),
              ]
            : null,
      ),
      child: state == _DotState.done
          ? AppIcon(AppIcons.checkRounded, size: AppSizes.iconSm - 4, color: fg)
          : Text(
              '${index + 1}',
              style: typography.caption.copyWith(color: fg),
              textScaler: TextScaler.noScaling,
            ),
    );
    return Semantics(
      button: onTap != null,
      selected: state == _DotState.current,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: AppSizes.touchTarget,
          height: AppSizes.hitTarget,
          child: Center(child: dot),
        ),
      ),
    );
  }
}
