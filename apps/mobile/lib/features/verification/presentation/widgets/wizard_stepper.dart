import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Wizard progress header (docs/03 §8 "шаги с прогресс-баром"): a gold
/// rail that fills as the attorney advances, numbered medallions (done =
/// check, current = gold ring), the current step name and "Step N of M".
/// Done steps are tappable to jump back. Animated fill honours
/// reduce-motion. Owner 2026-11-05: the rail and the caption now live in
/// the design system ([AppNumberedStepRail], [AppStepCaption]) so every
/// step flow shows this same stepper.
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
          AppNumberedStepRail(
            count: labels.length,
            current: current,
            labels: labels,
            onTapStep: onTapStep,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppStepCaption(label: labels[current], stepOfLabel: stepOfLabel),
        ],
      ),
    );
  }
}
