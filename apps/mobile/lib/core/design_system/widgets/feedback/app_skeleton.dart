import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

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
    this.shimmer = true,
  });

  final double? width;
  final double height;
  final double borderRadius;

  /// False renders the static base block (p12 leaf-1.6): used where the
  /// skeleton is a still illustration (empty-state card previews), not a
  /// loading indicator — docs/07 §1 "одна запоминающаяся деталь на экран".
  final bool shimmer;

  @override
  State<AppSkeleton> createState() => _AppSkeletonState();
}

/// S16-7: one clock for every shimmering skeleton on screen (Flutter's
/// shimmer-loading guidance: one animation drives all placeholders). A feed
/// skeleton of 15 boxes used to own 15 repeating controllers/tickers; now one
/// ticker runs while at least one box listens, and stops when none does.
class _ShimmerClock extends ChangeNotifier implements TickerProvider {
  _ShimmerClock._();

  static final instance = _ShimmerClock._();

  Ticker? _ticker;
  double value = 0;

  @override
  Ticker createTicker(TickerCallback onTick) => Ticker(onTick);

  @override
  void addListener(VoidCallback listener) {
    super.addListener(listener);
    _ticker ??= createTicker((elapsed) {
      value = (elapsed.inMicroseconds %
              AppMotion.shimmer.inMicroseconds) /
          AppMotion.shimmer.inMicroseconds;
      notifyListeners();
    })
      ..start();
  }

  @override
  void removeListener(VoidCallback listener) {
    super.removeListener(listener);
    if (!hasListeners) {
      _ticker?.dispose();
      _ticker = null;
    }
  }
}

class _AppSkeletonState extends State<AppSkeleton> {
  bool _listening = false;

  void _sync({required bool want}) {
    if (want == _listening) return;
    _listening = want;
    if (want) {
      _ShimmerClock.instance.addListener(_tick);
    } else {
      _ShimmerClock.instance.removeListener(_tick);
    }
  }

  void _tick() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Only tick when motion is allowed and the route is visible (TickerMode)
    // — no idle ticker otherwise.
    _sync(
      want: !context.reduceMotion && widget.shimmer && TickerMode.valuesOf(context).enabled,
    );
  }

  @override
  void didUpdateWidget(AppSkeleton old) {
    super.didUpdateWidget(old);
    _sync(
      want: !context.reduceMotion && widget.shimmer && TickerMode.valuesOf(context).enabled,
    );
  }

  @override
  void dispose() {
    _sync(want: false);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final radius = BorderRadius.circular(widget.borderRadius);

    if (context.reduceMotion || !widget.shimmer) {
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

    // Highlight travels from fully off the left edge to fully off the right
    // edge each cycle.
    final shift = _ShimmerClock.instance.value * 3 - 1.5;
    return ExcludeSemantics(
      child: RepaintBoundary(
        child: Container(
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
        ),
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
