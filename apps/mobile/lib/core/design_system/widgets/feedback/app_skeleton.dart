import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Loading-state placeholder (file 01 §15 component list; `.cursorrules`
/// requires a loading/skeleton state on every screen). A block with a soft
/// highlight sweeping left→right (UI modernization pass, 2026-09-27 —
/// replaces the earlier opacity pulse). Static base color under
/// reduce-motion.
class AppSkeleton extends StatefulWidget {
  const AppSkeleton({
    super.key,
    this.width,
    this.height = AppSpacing.lg,
    this.borderRadius = AppSpacing.sm,
  });

  final double? width;
  final double height;
  final double borderRadius;

  @override
  State<AppSkeleton> createState() => _AppSkeletonState();
}

class _AppSkeletonState extends State<AppSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: AppMotion.shimmer);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Only tick when motion is allowed — no idle controller otherwise.
    if (context.reduceMotion) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final radius = BorderRadius.circular(widget.borderRadius);

    if (context.reduceMotion) {
      return ExcludeSemantics(
        child: Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: colors.skeletonBase,
            borderRadius: radius,
          ),
        ),
      );
    }

    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          // Highlight travels from fully off the left edge to fully off
          // the right edge each cycle.
          final shift = _controller.value * 3 - 1.5;
          return Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              borderRadius: radius,
              gradient: LinearGradient(
                begin: Alignment(shift - 1, 0),
                end: Alignment(shift + 1, 0),
                colors: [
                  colors.skeletonBase,
                  colors.skeletonHighlight,
                  colors.skeletonBase,
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Skeleton shaped like a list card (medallion + two text lines), used by
/// list screens' loading state so the placeholder matches the real rows.
class AppSkeletonCard extends StatelessWidget {
  const AppSkeletonCard({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: const Row(
        children: [
          AppSkeleton(
            width: AppSizes.rowMedallion,
            height: AppSizes.rowMedallion,
            borderRadius: AppRadii.pill,
          ),
          SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FractionallySizedBox(
                  widthFactor: 0.6,
                  child: AppSkeleton(),
                ),
                SizedBox(height: AppSpacing.sm),
                FractionallySizedBox(
                  widthFactor: 0.4,
                  child: AppSkeleton(height: AppSpacing.md),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
