import 'package:flutter/material.dart';
import 'package:flutter/physics.dart' show SpringDescription, SpringSimulation;
import 'package:lawbid/core/navigation/shell/shell_layout.dart'
    show isDesktopWindow;

/// Owner row 88 (2026-11-13): every dialog of the app comes in the way an
/// iPhone alert does — it fades in while shrinking from 1.3× to its size,
/// and only fades out — instead of Flutter's Material 150 ms fade.
///
/// Copied from Flutter's `CupertinoDialogRoute` (`cupertino/route.dart`,
/// BSD-3): the same 1.3 → 1.0 scale tween, fade-only exit, and the same
/// iOS standard spring (stiffness 522.35, damping 45.7099552, mass 1 —
/// critically damped, settles in about 404 ms, as `CASpringAnimation` in
/// Xcode). The look of the dialogs does not change, only how they appear.
///
/// A drop-in for `showDialog` (same arguments). Reduce motion: no motion.
/// A desktop web window keeps the plain fade (dialogs there are windows).
Future<T?> showAppDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
  Color? barrierColor,
  String? barrierLabel,
  bool useSafeArea = true,
  bool useRootNavigator = true,
  RouteSettings? routeSettings,
  Offset? anchorPoint,
  TraversalEdgeBehavior? traversalEdgeBehavior,
  bool? requestFocus,
}) {
  final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
  final desktop = isDesktopWindow(context);
  return showDialog<T>(
    context: context,
    builder: still || desktop
        ? builder
        : (ctx) => AppDialogScaleIn(child: builder(ctx)),
    barrierDismissible: barrierDismissible,
    barrierColor: barrierColor,
    barrierLabel: barrierLabel,
    useSafeArea: useSafeArea,
    useRootNavigator: useRootNavigator,
    routeSettings: routeSettings,
    anchorPoint: anchorPoint,
    traversalEdgeBehavior: traversalEdgeBehavior,
    requestFocus: requestFocus,
    animationStyle: still
        ? AnimationStyle.noAnimation
        : desktop
            ? null
            : AppDialogMotion.style,
  );
}

/// The iOS dialog motion values (Flutter `CupertinoDialogRoute`, BSD-3).
abstract final class AppDialogMotion {
  /// `_kStandardSpring` in Flutter's `cupertino/route.dart`.
  static const SpringDescription spring = SpringDescription(
    mass: 1,
    stiffness: 522.35,
    damping: 45.7099552,
  );

  /// The spring settles (within 0.1 %) in about this long.
  static const Duration duration = Duration(milliseconds: 404);

  /// `CupertinoDialogRoute._dialogScaleTween`.
  static const double scaleFrom = 1.3;

  static final Curve curve = SpringCurve(spring, duration);

  static final AnimationStyle style = AnimationStyle(
    duration: duration,
    reverseDuration: duration,
    curve: curve,
    reverseCurve: curve.flipped,
  );
}

/// A [SpringSimulation] from 0 to 1 laid over [duration] as a [Curve], so a
/// route with a fixed duration moves like the spring.
class SpringCurve extends Curve {
  SpringCurve(SpringDescription spring, this.duration)
      : _sim = SpringSimulation(spring, 0, 1, 0);

  final Duration duration;
  final SpringSimulation _sim;

  @override
  double transformInternal(double t) {
    final seconds =
        t * duration.inMicroseconds / Duration.microsecondsPerSecond;
    return _sim.x(seconds).clamp(0.0, 1.0);
  }
}

/// The scale half of the iOS dialog entrance; the route fades it.
class AppDialogScaleIn extends StatelessWidget {
  const AppDialogScaleIn({required this.child, super.key});

  static final Animatable<double> _scale = Tween<double>(
    begin: AppDialogMotion.scaleFrom,
    end: 1,
  ).chain(CurveTween(curve: AppDialogMotion.curve));

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final animation = ModalRoute.of(context)?.animation;
    if (animation == null) return child;
    return AnimatedBuilder(
      animation: animation,
      child: child,
      // One Transform always (the dialog's state stays); leaving, an iOS
      // alert only fades (CupertinoDialogRoute).
      builder: (context, child) => Transform.scale(
        scale: animation.status == AnimationStatus.forward
            ? _scale.evaluate(animation)
            : 1,
        child: child,
      ),
    );
  }
}
