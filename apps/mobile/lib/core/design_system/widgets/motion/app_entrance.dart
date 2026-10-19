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
/// 2026-09-27): a fade, [index] steps the start by
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
    this.animated = false,
  });

  /// Owner 2026-10-19: off by default (no entrance anywhere); true only
  /// where a screen really wants the fade in.
  final bool animated;

  final Widget child;

  /// Position in the stagger sequence (0 = first).
  final int index;

  /// Also grow from [AppMotion.entranceScaleFrom] (used for medallions).
  final bool scale;

  @override
  Widget build(BuildContext context) {
    // Owner 2026-10-19 («мигание», everywhere — Instagram has no entrance
    // animations): content, empty states and rows appear at once. A list,
    // a tab or a filter that is rebuilt no longer fades or rises in again,
    // which read as a blink. The old animation is kept below for a screen
    // that asks for it explicitly ([animated]).
    if (!animated || context.reduceMotion) return child;
    final delay = AppMotion.entranceStagger * index;
    var out = child.animate().fadeIn(
          delay: delay,
          duration: AppMotion.entrance,
          curve: AppMotion.enterCurve,
        );
    // Owner 2026-10-19 («данные прыгают», everywhere): no rise from below —
    // rows and blocks only fade in, nothing moves when a tab or a list
    // opens. (AppMotion.entranceRise stays for an explicit motion.)
    if (scale) {
      out = out.scaleXY(
        begin: AppMotion.entranceScaleFrom,
        end: 1,
        delay: delay,
        duration: AppMotion.entrance,
        curve: AppMotion.enterCurve,
      );
    }
    return out;
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
