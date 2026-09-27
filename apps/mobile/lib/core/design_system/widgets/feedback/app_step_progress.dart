import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Segmented step indicator for multi-step flows (UI modernization pass,
/// 2026-09-27). Completed/current segments fill with [activeColor]
/// (defaults to gold), animating on change. [semanticLabel] (e.g.
/// `t('common.stepOf', ...)`) is announced instead of the drawing.
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
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final active = activeColor ?? colors.gold;
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stateChange;

    return Semantics(
      label: semanticLabel,
      excludeSemantics: true,
      child: Row(
        children: [
          for (var i = 0; i < total; i++) ...[
            if (i > 0) const SizedBox(width: AppSpacing.xs),
            Expanded(
              child: AnimatedContainer(
                duration: duration,
                curve: AppMotion.enterCurve,
                height: AppSizes.progressSegment,
                decoration: BoxDecoration(
                  color: i < current ? active : colors.border,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
