import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:swipeable_page_route/swipeable_page_route.dart';

/// Owner 2026-10-22: «back» by a swipe that starts anywhere, not only at the
/// left edge (Instagram on iPhone). The rule is written in docs/ux/GESTURES.md.
///
/// Two layers, both wired once in [AppBackSwipeTransitionsBuilder] (the
/// theme's page transitions — it covers go_router pages and every
/// `Navigator.push(MaterialPageRoute(…))` alike):
///  * the EDGE strip (24 dp, on top of the screen — package
///    `swipeable_page_route`): always works, over carousels, tab pages and
///    swipe-able rows alike;
///  * the FULL-WIDTH drag ([_BackSwipeUnderlay], an ANCESTOR of the screen):
///    a rightward drag that starts anywhere, but only when no widget below
///    wants the horizontal drag (a carousel, a tab page view, a row with
///    side actions, a slider claim it first in the gesture arena — an
///    ancestor's recognizer is the last to be asked).
///
/// A screen picks its mode with [BackSwipe]. The default is
/// [BackSwipeMode.full].
enum BackSwipeMode {
  /// Edge strip + a drag from anywhere that no child claims.
  full,

  /// The edge strip only (a screen whose middle must never go back).
  edge,

  /// Only the drag from anywhere, no edge strip: lists whose rows have side
  /// actions on their own edges (`EdgeSwipe`, 32 dp each side). A row's edge
  /// belongs to the row; every other spot of the screen goes back.
  rows,

  /// No swipe back (a screen that must be left by its own buttons).
  off,
}

final Expando<BackSwipeMode> _modes = Expando('BackSwipeMode');

/// Width of the edge strip. iOS' own is about 20 dp.
const double kBackSwipeEdgeWidth = 24;

/// Sets how the route that holds [child] is swiped back.
class BackSwipe extends StatefulWidget {
  const BackSwipe({required this.mode, required this.child, super.key});

  final BackSwipeMode mode;
  final Widget child;

  @override
  State<BackSwipe> createState() => _BackSwipeState();
}

class _BackSwipeState extends State<BackSwipe> {
  ModalRoute<dynamic>? _route;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _route = ModalRoute.of(context);
    _set();
  }

  @override
  void didUpdateWidget(BackSwipe old) {
    super.didUpdateWidget(old);
    _set();
  }

  void _set() {
    final route = _route;
    if (route != null) _modes[route] = widget.mode;
  }

  @override
  void dispose() {
    final route = _route;
    if (route != null) _modes[route] = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// What a widget below a route may ask about swiping it back.
class BackSwipeScope extends InheritedWidget {
  const BackSwipeScope({
    required this.route,
    required super.child,
    super.key,
  });

  final PageRoute<dynamic> route;

  /// True when a drag from anywhere can leave this screen now: the screen is
  /// pushed, in [BackSwipeMode.full] and not animating. Screens with their
  /// own horizontal pages use it to hand the first page's rightward drag
  /// over to «back».
  static bool fullActive(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<BackSwipeScope>();
    if (scope == null) return false;
    final mode = _modes[scope.route] ?? BackSwipeMode.full;
    return _enabled(scope.route) &&
        (mode == BackSwipeMode.full || mode == BackSwipeMode.rows);
  }

  /// A swipe-back screen is above (decided once per build).
  static bool exists(BuildContext context) =>
      context.getInheritedWidgetOfExactType<BackSwipeScope>() != null;

  @override
  bool updateShouldNotify(BackSwipeScope old) => route != old.route;
}

bool _enabled(PageRoute<dynamic> route) {
  if (route.isFirst) return false;
  if (route.willHandlePopInternally) return false;
  if (route.popDisposition == RoutePopDisposition.doNotPop) return false;
  if (route.fullscreenDialog) return false;
  if (route.animation?.status != AnimationStatus.completed) return false;
  if (route.secondaryAnimation?.status != AnimationStatus.dismissed) {
    return false;
  }
  if (route.popGestureInProgress) return false;
  return true;
}

/// The theme's page transition on iOS, Android and macOS: the Cupertino
/// slide with [BackSwipeMode]-aware swipe back. (Web keeps Flutter's plain
/// Cupertino transition: a mouse or a trackpad scroll must never go back.)
class AppBackSwipeTransitionsBuilder extends PageTransitionsBuilder {
  const AppBackSwipeTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (kIsWeb) {
      return const CupertinoPageTransitionsBuilder().buildTransitions<T>(
        route,
        context,
        animation,
        secondaryAnimation,
        child,
      );
    }
    return SwipeablePageRoute.buildPageTransitions<T>(
      route,
      context,
      animation,
      secondaryAnimation,
      BackSwipeScope(
        route: route,
        child: _BackSwipeUnderlay<T>(route: route, child: child),
      ),
      canSwipe: () {
        final mode = _modes[route] ?? BackSwipeMode.full;
        return mode == BackSwipeMode.full || mode == BackSwipeMode.edge;
      },
      canOnlySwipeFromEdge: () => true,
      backGestureDetectionWidth: () => kBackSwipeEdgeWidth,
    );
  }
}

/// The page transitions every platform of the app uses.
const PageTransitionsTheme kBackSwipeTransitions = PageTransitionsTheme(
  builders: {
    TargetPlatform.android: AppBackSwipeTransitionsBuilder(),
    TargetPlatform.iOS: AppBackSwipeTransitionsBuilder(),
    TargetPlatform.macOS: AppBackSwipeTransitionsBuilder(),
  },
);

class _BackSwipeUnderlay<T> extends StatefulWidget {
  const _BackSwipeUnderlay({required this.route, required this.child});

  final PageRoute<T> route;
  final Widget child;

  @override
  State<_BackSwipeUnderlay<T>> createState() => _BackSwipeUnderlayState<T>();
}

class _BackSwipeUnderlayState<T> extends State<_BackSwipeUnderlay<T>> {
  _PopController? _controller;

  bool get _allowed {
    final mode = _modes[widget.route] ?? BackSwipeMode.full;
    return (mode == BackSwipeMode.full || mode == BackSwipeMode.rows) &&
        _enabled(widget.route);
  }

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return RawGestureDetector(
      behavior: HitTestBehavior.translucent,
      gestures: {
        _BackDrag: GestureRecognizerFactoryWithHandlers<_BackDrag>(
          () => _BackDrag(
            debugOwner: this,
            rtl: rtl,
            enabled: () => _allowed,
            started: () => _controller != null,
          ),
          (r) => r
            ..rtl = rtl
            ..onStart = _start
            ..onUpdate = _update
            ..onEnd = _end
            ..onCancel = _cancel,
        ),
      },
      child: widget.child,
    );
  }

  double _logical(double v) =>
      Directionality.of(context) == TextDirection.rtl ? -v : v;

  void _start(DragStartDetails _) {
    final route = widget.route;
    final nav = route.navigator;
    // ignore: invalid_use_of_protected_member
    final controller = route.controller;
    if (nav == null || controller == null) return;
    _controller = _PopController(nav, controller);
  }

  void _update(DragUpdateDetails d) {
    final width = context.size?.width ?? 1;
    _controller?.update(_logical(d.primaryDelta ?? 0) / width);
  }

  void _end(DragEndDetails d) {
    final width = context.size?.width ?? 1;
    _controller?.end(_logical(d.velocity.pixelsPerSecond.dx) / width);
    _controller = null;
  }

  void _cancel() {
    _controller?.end(0);
    _controller = null;
  }
}

/// A rightward (leftward in RTL) horizontal drag, touch or stylus only (a
/// mouse or a trackpad never goes back), mostly horizontal.
class _BackDrag extends HorizontalDragGestureRecognizer {
  _BackDrag({
    required this.rtl,
    required this.enabled,
    required this.started,
    super.debugOwner,
  }) : super(
          supportedDevices: const {
            PointerDeviceKind.touch,
            PointerDeviceKind.stylus,
          },
        );

  bool rtl;
  final bool Function() enabled;
  final bool Function() started;

  Offset _moved = Offset.zero;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    if (!enabled()) return;
    _moved = Offset.zero;
    super.addAllowedPointer(event);
  }

  @override
  void handleEvent(PointerEvent event) {
    if (!started() && event is PointerMoveEvent) {
      final dx = event.delta.dx;
      // The wrong way: this finger is not going back.
      if (rtl ? dx > 0 : dx < 0) {
        resolvePointer(event.pointer, GestureDisposition.rejected);
        return;
      }
      _moved += event.delta;
    }
    super.handleEvent(event);
  }

  @override
  bool hasSufficientGlobalDistanceToAccept(
    PointerDeviceKind pointerDeviceKind,
    double? deviceTouchSlop,
  ) =>
      super.hasSufficientGlobalDistanceToAccept(
        pointerDeviceKind,
        deviceTouchSlop,
      ) &&
      // A slanted drag is a scroll, not a «back».
      _moved.dx.abs() > _moved.dy.abs() * 1.7;
}

// Copy of Flutter's (private) Cupertino back-gesture controller; see
// swipeable_page_route for the same copy at the edge.
const double _kMinFlingVelocity = 1; // screen widths per second
const int _kMaxForwardMs = 800;
const int _kMaxBackMs = 300;

class _PopController {
  _PopController(this.navigator, this.controller) {
    navigator.didStartUserGesture();
  }

  final NavigatorState navigator;
  final AnimationController controller;

  void update(double delta) => controller.value -= delta;

  void end(double velocity) {
    const curve = Curves.fastLinearToSlowEaseIn;
    final bool forward;
    if (velocity.abs() >= _kMinFlingVelocity) {
      forward = velocity <= 0;
    } else {
      forward = controller.value > 0.5;
    }
    if (forward) {
      final ms = math.min(
        lerpDouble(_kMaxForwardMs, 0, controller.value)!.floor(),
        _kMaxBackMs,
      );
      unawaited(
        controller.animateTo(
          1,
          duration: Duration(milliseconds: ms),
          curve: curve,
        ),
      );
    } else {
      navigator.pop();
      if (controller.isAnimating) {
        final ms = lerpDouble(0, _kMaxForwardMs, controller.value)!.floor();
        unawaited(
          controller.animateBack(
            0,
            duration: Duration(milliseconds: ms),
            curve: curve,
          ),
        );
      }
    }
    if (controller.isAnimating) {
      late AnimationStatusListener listener;
      listener = (status) {
        navigator.didStopUserGesture();
        controller.removeStatusListener(listener);
      };
      controller.addStatusListener(listener);
    } else {
      navigator.didStopUserGesture();
    }
  }
}

/// Puts [kBackSwipeTransitions] over the router's Navigator (the theme file
/// belongs to the design system). Under «reduce motion» the theme's own
/// still transitions stay: no slide, no swipe.
class BackSwipeTheme extends StatelessWidget {
  const BackSwipeTheme({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (context.reduceMotion) return child;
    return Theme(
      data: Theme.of(context).copyWith(
        pageTransitionsTheme: kBackSwipeTransitions,
      ),
      child: child,
    );
  }
}

/// The page view under a [PageDragHost] takes no drag itself (the host's
/// [YieldingPageDrag] moves it); everything else is the platform's.
class OwnDragPhysics extends ScrollPhysics {
  const OwnDragPhysics({super.parent});

  @override
  OwnDragPhysics applyTo(ScrollPhysics? ancestor) =>
      OwnDragPhysics(parent: buildParent(ancestor));

  @override
  bool shouldAcceptUserOffset(ScrollMetrics position) => false;
}

/// A horizontal drag that does not claim the finger when it runs past the
/// first or last page ([yields]): whoever is around the pages takes it —
/// the outer pages, or «back» of the pushed screen.
class YieldingPageDrag extends HorizontalDragGestureRecognizer {
  YieldingPageDrag({super.supportedDevices});

  /// [dx]: global distance moved so far (+ = to the right).
  bool Function(double dx) yields = _never;

  static bool _never(double _) => false;

  @override
  bool hasSufficientGlobalDistanceToAccept(
    PointerDeviceKind pointerDeviceKind,
    double? deviceTouchSlop,
  ) =>
      super.hasSufficientGlobalDistanceToAccept(
        pointerDeviceKind,
        deviceTouchSlop,
      ) &&
      !yields(globalDistanceMoved);
}

/// Moves the [PageView] below it (built with [OwnDragPhysics] and
/// [controller]) by a drag it receives itself, and lets that drag go past
/// the first or last page when [yields] says so.
class PageDragHost extends StatefulWidget {
  const PageDragHost({
    required this.controller,
    required this.yields,
    required this.child,
    super.key,
  });

  final PageController controller;
  final bool Function(double dx) yields;
  final Widget child;

  @override
  State<PageDragHost> createState() => _PageDragHostState();
}

class _PageDragHostState extends State<PageDragHost> {
  Drag? _drag;
  ScrollHoldController? _hold;

  @override
  Widget build(BuildContext context) {
    final pages = widget.controller;
    final config = ScrollConfiguration.of(context);
    final physics = config.getScrollPhysics(context);
    return RawGestureDetector(
      gestures: {
        YieldingPageDrag:
            GestureRecognizerFactoryWithHandlers<YieldingPageDrag>(
          () => YieldingPageDrag(supportedDevices: config.dragDevices),
          (r) => r
            ..yields = widget.yields
            ..onDown = (_) {
              if (pages.hasClients) {
                _hold = pages.position.hold(() => _hold = null);
              }
            }
            ..onStart = (d) {
              if (pages.hasClients) {
                _drag = pages.position.drag(d, () => _drag = null);
              }
            }
            ..onUpdate = ((d) {
              _drag?.update(d);
            })
            ..onEnd = ((d) {
              _drag?.end(d);
            })
            ..onCancel = () {
              _hold?.cancel();
              _drag?.cancel();
            }
            ..minFlingDistance = physics.minFlingDistance
            ..minFlingVelocity = physics.minFlingVelocity
            ..maxFlingVelocity = physics.maxFlingVelocity
            ..velocityTrackerBuilder = config.velocityTrackerBuilder(context)
            ..multitouchDragStrategy = config.getMultitouchDragStrategy(context)
            ..gestureSettings = MediaQuery.maybeGestureSettingsOf(context),
        ),
      },
      child: widget.child,
    );
  }
}

/// A [PageView] on a screen that can be swiped back: its first page's drag
/// towards the start goes to «back» instead of bouncing. Build the
/// `PageView` with [BackAwarePages.physicsFor] and wrap it in this.
class BackAwarePages extends StatelessWidget {
  const BackAwarePages({
    required this.controller,
    required this.child,
    super.key,
  });

  final PageController controller;
  final Widget child;

  /// Physics for the wrapped page view: [OwnDragPhysics] when the screen
  /// has a swipe back above it (the host moves the pages), else default.
  static ScrollPhysics? physicsFor(BuildContext context) =>
      BackSwipeScope.exists(context) ? const OwnDragPhysics() : null;

  bool _yields(BuildContext context, double dx) {
    if (!controller.hasClients || dx == 0) return false;
    final page = controller.page ?? controller.initialPage.toDouble();
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final toStart = rtl ? dx < 0 : dx > 0;
    return toStart && page <= 0.01 && BackSwipeScope.fullActive(context);
  }

  @override
  Widget build(BuildContext context) {
    if (!BackSwipeScope.exists(context)) return child;
    return PageDragHost(
      controller: controller,
      yields: (dx) => _yields(context, dx),
      child: child,
    );
  }
}
