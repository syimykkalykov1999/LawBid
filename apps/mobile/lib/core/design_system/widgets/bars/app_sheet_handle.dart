import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/navigation/shell/content_column_frame.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

/// Drag handle at the top of modal bottom sheets (decorative).
class AppSheetHandle extends StatelessWidget {
  const AppSheetHandle({super.key});

  @override
  Widget build(BuildContext context) {
    // Desktop: the sheet is a window in the middle — nothing to drag.
    if (DesktopSheetDialog.of(context)) {
      return const SizedBox(height: AppSpacing.sm);
    }
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ExcludeSemantics(
      child: Center(
        child: Container(
          width: AppSizes.sheetHandleWidth,
          height: AppSizes.sheetHandleHeight,
          margin: const EdgeInsets.only(bottom: AppSpacing.lg),
          decoration: BoxDecoration(
            color: colors.border,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
        ),
      ),
    );
  }
}

/// Opens a modal bottom sheet with the design system's shape/colors
/// (UI modernization pass, 2026-09-27: 24px top radius, surface fill,
/// themed scrim). Thin wrapper over [showModalBottomSheet].
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = false,
  // Owner 2026-10-15: a long picker scrolls without closing — only its
  // handle closes it.
  bool closeByHandleOnly = false,
  // Phone only: keeps the sheet below the status bar (the desktop dialog
  // is centred and never needs it).
  bool useSafeArea = false,
}) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  // Desktop web plan 2026-10-28 §5.5: on a desktop window a sheet from the
  // bottom is a window in the middle (Esc or a click outside closes it).
  if (isDesktopWindow(context)) {
    return showDesktopSheetDialog<T>(context, builder);
  }
  return showModalBottomSheet<T>(
    context: context,
    // Owner 2026-10-15: every sheet opens over the floating nav bar, never
    // under it (the last row of a menu was hidden behind it).
    useRootNavigator: true,
    isScrollControlled: isScrollControlled,
    useSafeArea: useSafeArea,
    constraints: contentColumnSheetConstraints(context),
    backgroundColor: sheetRouteColor(context, colors.sheet),
    elevation: sheetDrawnByColumn(context) ? 0 : null,
    showDragHandle: false,
    // Owner row 88 (2026-11-13): Material 3 sheet timing (AppMotion).
    sheetAnimationStyle: context.reduceMotion
        ? AnimationStyle.noAnimation
        : const AnimationStyle(
            duration: AppMotion.sheetEnter,
            reverseDuration: AppMotion.sheetExit,
            curve: AppMotion.sheetEnterCurve,
            reverseCurve: AppMotion.sheetExitCurve,
          ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(AppRadii.sheet),
      ),
    ),
    // Owner 2026-10-01: every sheet closes with a swipe down — also when
    // its whole body scrolls (the list used to swallow the drag).
    builder: (ctx) => ContentColumnFrame(
      surface: colors.sheet,
      radius: const BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
      child: closeByHandleOnly
          ? builder(ctx)
          : PullDownToClose(
              routeCurve: AppMotion.sheetEnterCurve,
              child: builder(ctx),
            ),
    ),
  );
}

/// Pops the current route when the user pulls a scrollable down past its
/// top (Android overscroll or iOS bounce). Wraps sheets and modal pages.
///
/// Owner row 88 (2026-11-13): the sheet (or the modal page) follows the
/// finger while the list is pulled past its top, as on iOS, Telegram and
/// Instagram, and on release either closes from where it is or glides back.
/// The drag drives the route's own animation like Flutter's `BottomSheet`
/// drag (material/bottom_sheet.dart: `value -= delta / height`, a fling over
/// 700 px/s or less than half left closes) and the release is Flutter's
/// `CupertinoSheetRoute` one (cupertino/sheet.dart: pop, then the rest over
/// 300 ms `easeOut`, the user gesture held until it stops) — both BSD-3.
/// Under reduce motion it only pops past [threshold], as before.
class PullDownToClose extends StatefulWidget {
  const PullDownToClose({
    required this.child,
    this.threshold = 72,
    this.routeCurve,
    super.key,
  });

  final Widget child;

  /// Pixels pulled beyond the top that close the route on release.
  final double threshold;

  /// The forward curve the route draws its animation with (a bottom
  /// sheet's `sheetAnimationStyle.curve`). The finger is mapped through
  /// its inverse so the sheet moves 1:1. Null: the route goes linear
  /// during a user gesture by itself (a Cupertino page).
  final Curve? routeCurve;

  @override
  State<PullDownToClose> createState() => _PullDownToCloseState();
}

class _PullDownToCloseState extends State<PullDownToClose> {
  static const double _minFlingVelocity = 700; // BottomSheet, px/s
  static const double _closeProgressThreshold = 0.5; // BottomSheet
  static const Duration _droppedDuration = Duration(milliseconds: 300);

  double _pulled = 0;
  bool _closing = false;

  /// The route's controller while the finger moves it (null otherwise).
  AnimationController? _drag;
  NavigatorState? _navigator;

  void _close() {
    if (_closing) return;
    _closing = true;
    Navigator.of(context).maybePop();
  }

  bool get _follows => !context.reduceMotion;

  AnimationController? _routeController() {
    final route = ModalRoute.of(context);
    if (route == null) return null;
    // ignore: invalid_use_of_protected_member
    final controller = route.controller;
    if (controller == null || controller.value != 1) return null;
    return controller;
  }

  /// Visible fraction (1 = fully open) → the controller value under the
  /// route's curve (bisection: the curves are monotonic).
  double _valueFor(double shown) {
    final curve = widget.routeCurve;
    if (curve == null) return shown;
    var lo = 0.0;
    var hi = 1.0;
    for (var i = 0; i < 24; i++) {
      final mid = (lo + hi) / 2;
      if (curve.transform(mid) < shown) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  void _move() {
    var controller = _drag;
    if (controller == null) {
      controller = _routeController();
      if (controller == null) return;
      _drag = controller;
      _navigator = Navigator.of(context)..didStartUserGesture();
    }
    final height = context.size?.height ?? 1;
    final shown = (1 - _pulled / height).clamp(0.0, 1.0);
    controller.value = shown >= 1 ? 1 : _valueFor(shown);
  }

  void _stopGesture(AnimationController controller) {
    final navigator = _navigator;
    _navigator = null;
    if (navigator == null) return;
    if (controller.isAnimating) {
      void done(AnimationStatus _) {
        navigator.didStopUserGesture();
        controller.removeStatusListener(done);
      }

      controller.addStatusListener(done);
    } else {
      navigator.didStopUserGesture();
    }
  }

  Future<void> _release(double velocity) async {
    final controller = _drag;
    _drag = null;
    final pulled = _pulled;
    _pulled = 0;
    if (controller == null) return;
    // Half of the sheet left on screen, not the controller value (that
    // runs under the route's curve).
    final height = context.size?.height ?? 1;
    final close = velocity > _minFlingVelocity ||
        pulled > widget.threshold ||
        1 - pulled / height < _closeProgressThreshold;
    if (!close) {
      unawaited(
        controller.animateTo(
          1,
          duration: _droppedDuration,
          curve: Curves.easeOut,
        ),
      );
      _stopGesture(controller);
      return;
    }
    final route = ModalRoute.of(context);
    _closing = true;
    await Navigator.of(context).maybePop();
    // A screen that refused to close (unsaved changes) comes back up.
    if (route != null && route.isCurrent) {
      _closing = false;
      unawaited(
        controller.animateTo(
          1,
          duration: _droppedDuration,
          curve: Curves.easeOut,
        ),
      );
    } else if (controller.isAnimating) {
      unawaited(
        controller.animateBack(
          0,
          duration: _droppedDuration,
          curve: Curves.easeOut,
        ),
      );
    }
    _stopGesture(controller);
  }

  /// The list being dragged now scrolls vertically (the overscroll
  /// indicator's own notification does not say).
  bool _vertical = false;

  bool _onScroll(ScrollNotification n) {
    _vertical = n.metrics.axis == Axis.vertical;
    if (!_vertical || _closing) return false;
    // A multiline field's own scrolling never closes the sheet (it would
    // lose what was typed).
    if (n.context?.findAncestorWidgetOfExactType<EditableText>() != null) {
      return false;
    }
    if (n is OverscrollNotification &&
        n.dragDetails != null &&
        n.overscroll < 0 &&
        n.metrics.pixels <= n.metrics.minScrollExtent) {
      _pulled -= n.overscroll;
      if (_follows) {
        _move();
      } else if (_pulled > widget.threshold) {
        _close();
      }
    } else if (n is ScrollUpdateNotification && n.dragDetails != null) {
      if (_drag != null && (n.scrollDelta ?? 0) > 0) {
        // The finger goes back up: the sheet rises first.
        _pulled = math.max(0, _pulled - n.scrollDelta!);
        _move();
        return false;
      }
      // iOS bounce: the list goes below its top.
      final below = n.metrics.minScrollExtent - n.metrics.pixels;
      if (below > widget.threshold) _close();
      if ((n.scrollDelta ?? 0) > 0) _pulled = 0;
    } else if (n is ScrollEndNotification) {
      if (_drag != null) {
        unawaited(_release(n.dragDetails?.velocity.pixelsPerSecond.dy ?? 0));
      } else {
        _pulled = 0;
      }
    }
    return false;
  }

  @override
  void dispose() {
    final controller = _drag;
    if (controller != null) {
      if (!controller.isAnimating && controller.value < 1) {
        controller.value = 1;
      }
      _stopGesture(controller);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Widget child = NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: widget.child,
    );
    if (_follows) {
      // While the sheet itself moves, the list does not also stretch or
      // glow at its top (Flutter: OverscrollIndicatorNotification
      // .disallowIndicator), and on iOS the top edge stops instead of
      // bouncing, so the pull moves the sheet, not the rows inside it.
      child = NotificationListener<OverscrollIndicatorNotification>(
        onNotification: (n) {
          if (n.leading && _vertical) {
            n.disallowIndicator();
          }
          return false;
        },
        child: ScrollConfiguration(
          behavior: ScrollConfiguration.of(context).copyWith(
            physics: _TopEdgeStopsPhysics(
              parent: ScrollConfiguration.of(context).getScrollPhysics(context),
            ),
          ),
          child: child,
        ),
      );
    }
    return child;
  }
}

/// Bouncing (or clamping) physics whose top edge of a vertical list stops
/// like Flutter's `ClampingScrollPhysics.applyBoundaryConditions` (BSD-3:
/// the underscroll and "hit the top edge" lines); everything else is the
/// parent's.
class _TopEdgeStopsPhysics extends ScrollPhysics {
  const _TopEdgeStopsPhysics({super.parent});

  @override
  _TopEdgeStopsPhysics applyTo(ScrollPhysics? ancestor) =>
      _TopEdgeStopsPhysics(parent: buildParent(ancestor));

  @override
  double applyBoundaryConditions(ScrollMetrics position, double value) {
    if (position.axis == Axis.vertical) {
      if (value < position.pixels &&
          position.pixels <= position.minScrollExtent) {
        return value - position.pixels; // underscroll
      }
      if (value < position.minScrollExtent &&
          position.minScrollExtent < position.pixels) {
        return value - position.minScrollExtent; // hit the top edge
      }
    }
    return super.applyBoundaryConditions(position, value);
  }
}

/// Desktop web plan §5.5 / PR 5: opens [builder] (a sheet's content) as a
/// centred window instead of a bottom sheet. Esc or a click on the dim
/// background closes it; Tab stays inside it (a dialog route is its own
/// focus scope). Used by [showAppBottomSheet] and by the few sheets that
/// keep their own phone look but still must become a window.
Future<T?> showDesktopSheetDialog<T>(
  BuildContext context,
  WidgetBuilder builder,
) =>
    showDialog<T>(
      context: context,
      builder: (ctx) => DesktopSheetDialog(child: builder(ctx)),
    );

/// Desktop web plan §5.5: what a bottom sheet becomes on a desktop window —
/// a dialog at most [maxWidth] wide and 80 % of the window high, with the
/// sheet's colour and corners. The content scrolls inside it when taller.
class DesktopSheetDialog extends StatelessWidget {
  const DesktopSheetDialog({required this.child, super.key});

  final Widget child;

  static const double maxWidth = 480;

  /// Whether [context] is inside one (the drag handle hides itself).
  static bool of(BuildContext context) =>
      context.getInheritedWidgetOfExactType<_InSheetDialog>() != null;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final height = MediaQuery.sizeOf(context).height;
    return Dialog(
      backgroundColor: colors.sheet,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.sheet),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: maxWidth,
          maxHeight: height * 0.8,
        ),
        child: Padding(
          padding: const EdgeInsets.only(top: AppSpacing.sm),
          child: _InSheetDialog(child: child),
        ),
      ),
    );
  }
}

class _InSheetDialog extends InheritedWidget {
  const _InSheetDialog({required super.child});

  @override
  bool updateShouldNotify(_InSheetDialog oldWidget) => false;
}
