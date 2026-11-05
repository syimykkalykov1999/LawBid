import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/widgets/feedback/app_numbered_stepper.dart';

/// Step indicator for multi-step flows. Owner 2026-11-05: no more bars —
/// the numbered rail of the attorney's «Верификация» wizard
/// ([AppNumberedStepRail]) everywhere. Steps before [current] show a check,
/// [current] a ring; [activeColor] (defaults to gold) tints them.
/// [semanticLabel] (e.g. `t('common.stepOf', ...)`) is announced instead
/// of the drawing.
class AppStepProgress extends StatelessWidget {
  const AppStepProgress({
    required this.total,
    required this.current,
    required this.semanticLabel,
    super.key,
    this.activeColor,
  });

  final int total;

  /// 1-based index of the current step.
  final int current;
  final String semanticLabel;
  final Color? activeColor;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel,
      excludeSemantics: true,
      child: AppNumberedStepRail(
        count: total,
        current: (current - 1).clamp(0, total),
        activeColor: activeColor,
      ),
    );
  }
}
