import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/display/app_trailing_cap.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';

/// The numbered step rail of the attorney's «Верификация» wizard (owner
/// 2026-11-05: the same numbered stepper everywhere instead of the bars):
/// a gold rail that fills as the person advances, numbered medallions
/// (done = check, current = gold ring) and nothing else. Moved here from
/// `verification/presentation/widgets/wizard_stepper.dart` unchanged, plus
/// one thing: on a narrow row every slot shrinks to fit (never below the
/// medallion), so 6 steps fit between a back arrow and its mirror at 320 pt.
class AppNumberedStepRail extends StatelessWidget {
  const AppNumberedStepRail({
    required this.count,
    required this.current,
    super.key,
    this.labels,
    this.onTapStep,
    this.activeColor,
  });

  final int count;

  /// 0-based index of the current step.
  final int current;

  /// Optional per-step names, read by screen readers.
  final List<String>? labels;

  /// Done steps are tappable when set (jump back).
  final ValueChanged<int>? onTapStep;

  /// Ring/fill colour of done and current steps; gold by default (the
  /// delete-account flow passes its danger tone).
  final Color? activeColor;

  static const double _dot = AppSizes.rowMedallion - AppSpacing.md; // 28

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stepSwitch;
    final fraction = count <= 1 ? 1.0 : current / (count - 1);
    final active = activeColor;

    return SizedBox(
      height: AppSizes.hitTarget,
      child: LayoutBuilder(
        builder: (context, box) {
          final slot = count <= 0
              ? AppSizes.touchTarget
              : math.max(
                  _dot,
                  math.min(AppSizes.touchTarget, box.maxWidth / count),
                );
          final inset = slot / 2;
          final railWidth = math.max<double>(0, box.maxWidth - inset * 2);
          return Stack(
            alignment: AlignmentDirectional.centerStart,
            children: [
              PositionedDirectional(
                start: inset,
                width: railWidth,
                child: Container(height: 2, color: colors.border),
              ),
              PositionedDirectional(
                start: inset,
                child: TweenAnimationBuilder<double>(
                  tween: Tween(end: fraction.clamp(0.0, 1.0)),
                  duration: duration,
                  curve: AppMotion.enterCurve,
                  builder: (context, v, _) => Container(
                    height: 2,
                    width: railWidth * v,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: AlignmentDirectional.centerStart,
                        end: AlignmentDirectional.centerEnd,
                        colors: active == null
                            ? [colors.goldDark, colors.gold]
                            : [active, active],
                      ),
                    ),
                  ),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (var i = 0; i < count; i++)
                    _StepDot(
                      index: i,
                      label: labels != null && i < labels!.length
                          ? labels![i]
                          : null,
                      state: i < current
                          ? _DotState.done
                          : i == current
                              ? _DotState.current
                              : _DotState.upcoming,
                      size: _dot,
                      slot: slot,
                      activeColor: active,
                      duration: duration,
                      onTap: i < current && onTapStep != null
                          ? () => onTapStep!(i)
                          : null,
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

/// The caption under the rail: the current step's name (gold) at the
/// start, "Step N of M" at the end — as in the attorney's wizard.
class AppStepCaption extends StatelessWidget {
  const AppStepCaption({
    required this.label,
    required this.stepOfLabel,
    super.key,
  });

  final String label;
  final String stepOfLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stepSwitch;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Expanded(
          child: AnimatedSwitcher(
            duration: duration,
            layoutBuilder: (currentChild, previous) => Stack(
              alignment: AlignmentDirectional.centerStart,
              children: [
                ...previous,
                if (currentChild != null) currentChild,
              ],
            ),
            child: Text(
              label,
              key: ValueKey(label),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.caption.copyWith(color: colors.goldDark),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        AppTrailingCap(
          child: Text(
            stepOfLabel,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.end,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
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
    required this.slot,
    required this.activeColor,
    required this.duration,
    required this.onTap,
  });

  final int index;
  final String? label;
  final _DotState state;
  final double size;
  final double slot;
  final Color? activeColor;
  final Duration duration;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final active = activeColor;
    final (fill, border, fg) = switch (state) {
      _DotState.done => (
          active ?? colors.gold,
          active ?? colors.gold,
          active == null ? colors.navy : colors.surface,
        ),
      _DotState.current => (
          active == null ? colors.goldTint : colors.dangerTint,
          active ?? colors.gold,
          active ?? colors.accent,
        ),
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
        boxShadow: state == _DotState.current && active == null
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
              context.digits(index + 1),
              style: typography.caption.copyWith(color: fg),
              textScaler: TextScaler.noScaling,
            ),
    );
    return Semantics(
      button: onTap != null,
      selected: state == _DotState.current,
      label: label ?? context.digits(index + 1),
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: slot,
          height: AppSizes.hitTarget,
          child: Center(child: dot),
        ),
      ),
    );
  }
}
