import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import 'package:lawbid/core/design_system/tokens/app_motion.dart';

/// Reduce-motion lookup shared by every animated design-system widget.
extension AppMotionContext on BuildContext {
  /// True when the OS asks for reduced motion
  /// (`MediaQuery.disableAnimations`). Callers must render the final state
  /// immediately in that case.
  bool get reduceMotion => MediaQuery.maybeDisableAnimationsOf(this) ?? false;
}

/// Staggered entrance for screen content (UI modernization pass,
/// 2026-09-27): fade + short rise, [index] steps the start by
/// [AppMotion.entranceStagger]. With reduce-motion on, returns [child]
/// untouched — no animation, no delay.
///
/// Uses effect-level delays (inside one `AnimationController` timeline),
/// not `Animate.delay` (a `Future.delayed` timer), so `pumpAndSettle` in
/// widget/golden tests always settles to the final frame.
class AppEntrance extends StatelessWidget {
  const AppEntrance({
    required this.child,
    super.key,
    this.index = 0,
    this.scale = false,
  });

  final Widget child;

  /// Position in the stagger sequence (0 = first).
  final int index;

  /// Also grow from [AppMotion.entranceScaleFrom] (used for medallions).
  final bool scale;

  @override
  Widget build(BuildContext context) {
    if (context.reduceMotion) return child;
    final delay = AppMotion.entranceStagger * index;
    var animated = child
        .animate()
        .fadeIn(
          delay: delay,
          duration: AppMotion.entrance,
          curve: AppMotion.enterCurve,
        )
        .slideY(
          begin: AppMotion.entranceRise,
          end: 0,
          delay: delay,
          duration: AppMotion.entrance,
          curve: AppMotion.enterCurve,
        );
    if (scale) {
      animated = animated.scaleXY(
        begin: AppMotion.entranceScaleFrom,
        end: 1,
        delay: delay,
        duration: AppMotion.entrance,
        curve: AppMotion.enterCurve,
      );
    }
    return animated;
  }
}

/// Wraps each of [children] in an [AppEntrance] with increasing index.
/// Flex children ([Spacer], [Expanded]) and plain [SizedBox] gaps are
/// passed through unwrapped (and don't consume a stagger step).
List<Widget> staggeredEntrance(List<Widget> children, {int startIndex = 0}) {
  var index = startIndex;
  return [
    for (final child in children)
      if (child is Spacer ||
          child is Flexible ||
          (child is SizedBox && child.child == null))
        child
      else
        AppEntrance(index: index++, child: child),
  ];
}
