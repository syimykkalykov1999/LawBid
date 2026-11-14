import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

/// Owner 2026-10-12: the feed's top rows (Posts | Cases and the filter
/// chips) slide away when the list is scrolled down and come back only at
/// the very top of the list (the Feed tab button scrolls there).
/// row wrapped in [ChromeCollapse] follows it, anywhere else it stays.
///
/// Owner row 88 (2026-11-13, «данные прыгают»): the rows now move WITH the
/// finger, pixel for pixel, the way a floating, snapping `SliverAppBar`
/// does (Flutter `RenderSliverFloatingPersistentHeader`, BSD-3): while a
/// finger drags, the scroll goes into hiding (or showing) the rows first,
/// so the content stays under the finger; when the finger lets go half
/// way, the rows snap the way they were moving
/// (`FloatingHeaderSnapConfiguration`: 300 ms, `Curves.ease`). They used
/// to collapse on a 200 ms timer while the list scrolled under them.
class FeedChromeController extends ChangeNotifier {
  FeedChromeController({this.revealOnUp = false});

  /// Owner 2026-10-15 («Mine», like Instagram's header): scrolling up shows
  /// the rows again at once, not only at the very top of the list.
  final bool revealOnUp;

  /// Flutter's floating-header snap (`FloatingHeaderSnapConfiguration`
  /// defaults).
  static const snapDuration = Duration(milliseconds: 300);
  static const Curve snapCurve = Curves.ease;

  /// How much of the rows is hidden, in logical pixels (0 = all shown).
  double _hidden = 0;

  /// The rows' full height, measured by [ChromeCollapse]. 0 = unknown yet.
  double _extent = 0;

  /// The direction of the last finger move: true = towards hiding.
  bool _towardsHide = false;
  bool _dragging = false;

  /// Reduce motion (set by [ChromeCollapse]): snaps happen at once.
  bool reduceMotion = false;

  Ticker? _ticker;
  double _snapFrom = 0;
  double _snapTo = 0;

  /// Card height the feed lists use, kept stable while the rows hide so the
  /// cards do not resize during a scroll. Null = measure the list.
  double? cardHeight;

  /// Whether the rows are (mostly) on screen.
  bool get visible => _extent <= 0 ? _hidden <= 0 : _hidden < _extent / 2;

  /// The shown part of the rows, 1 = all, 0 = none.
  double get shown => _extent <= 0
      ? (_hidden > 0 ? 0 : 1)
      : (1 - _hidden / _extent).clamp(0.0, 1.0);

  /// Hidden pixels, for tests.
  @visibleForTesting
  double get hiddenPixels => _hidden;

  /// The rows' full height (0 = not laid out yet).
  double get extent => _extent;

  /// [ChromeCollapse] reports the rows' height on layout (no rebuild).
  set extent(double value) {
    if (value == _extent) return;
    final wasHidden = _extent > 0 && _hidden >= _extent;
    _extent = value;
    // Rows that were away stay away when they change height.
    _hidden = wasHidden ? value : _hidden.clamp(0.0, value);
  }

  void show() {
    _towardsHide = false;
    _snap(0);
  }

  void _set(double hidden) {
    final max = _extent > 0 ? _extent : 1.0;
    final v = hidden.clamp(0.0, max);
    if (v == _hidden) return;
    _hidden = v;
    notifyListeners();
  }

  void _snap(double target) {
    _ticker?.stop();
    if (target == _hidden) return;
    if (reduceMotion) {
      _set(target);
      return;
    }
    _snapFrom = _hidden;
    _snapTo = target;
    _ticker ??= Ticker(_onSnapTick, debugLabel: 'FeedChromeSnap');
    _ticker!.start();
  }

  void _onSnapTick(Duration elapsed) {
    final t = (elapsed.inMicroseconds / snapDuration.inMicroseconds).clamp(
      0.0,
      1.0,
    );
    _set(_snapFrom + (_snapTo - _snapFrom) * snapCurve.transform(t));
    if (t >= 1) _ticker?.stop();
  }

  /// When the finger stops half way, the rows finish the way they moved
  /// (`RenderSliverFloatingPersistentHeader.maybeStartSnapAnimation`).
  void _endDrag() {
    if (!_dragging) return;
    _dragging = false;
    final full = _extent > 0 ? _extent : 1.0;
    if (_hidden <= 0 || _hidden >= full) return;
    _snap(_towardsHide ? full : 0);
  }

  /// Feed this the vertical scroll notifications of the lists below.
  bool onScroll(ScrollNotification n) {
    if (n.metrics.axis != Axis.vertical) return false;
    if (n is ScrollEndNotification) {
      _endDrag();
      return false;
    }
    if (n is OverscrollNotification) {
      // Android clamps at the top: pulling further down brings the rows
      // back with the finger.
      if (n.dragDetails != null && n.overscroll < 0 && _hidden > 0) {
        _dragging = true;
        _towardsHide = false;
        _ticker?.stop();
        _set(_hidden + n.overscroll);
      }
      return false;
    }
    if (n is! ScrollUpdateNotification) return false;
    final d = n.scrollDelta ?? 0;
    if (n.dragDetails == null) {
      // A fling or a jump from code: the finger is gone.
      _endDrag();
      if (n.metrics.pixels <= n.metrics.minScrollExtent && _hidden > 0) {
        show();
      }
      return false;
    }
    _dragging = true;
    _ticker?.stop();
    if (d == 0) return false;
    final atTop = n.metrics.pixels <= n.metrics.minScrollExtent;
    // Owner 2026-10-12: once hidden the rows stay away while scrolling
    // up; they return at the very top (or on the Feed tab button).
    // «Mine» (revealOnUp) shows them on any scroll up.
    if (d < 0 && !revealOnUp && !atTop) return false;
    _towardsHide = d > 0;
    final before = _hidden;
    _set(_hidden + d);
    final change = _hidden - before;
    if (change == 0) return false;
    // The scroll went into the rows: the list keeps its offset, so what
    // is under the finger moves with it, not twice as far.
    final position = _positionOf(n);
    if (position != null && position.hasPixels) {
      final corrected = (position.pixels - change).clamp(
        position.minScrollExtent,
        double.infinity,
      );
      position.correctBy(corrected - position.pixels);
    }
    return false;
  }

  static ScrollPosition? _positionOf(ScrollNotification n) {
    final context = n.context;
    if (context == null || !context.mounted) return null;
    final position = Scrollable.maybeOf(context)?.position;
    if (position == null ||
        position.axisDirection != AxisDirection.down ||
        position is! ScrollPositionWithSingleContext) {
      return null;
    }
    return position;
  }

  @override
  void dispose() {
    _ticker?.dispose();
    super.dispose();
  }
}

class FeedChrome extends InheritedNotifier<FeedChromeController> {
  const FeedChrome({
    required FeedChromeController controller,
    required super.child,
    super.key,
  }) : super(notifier: controller);

  static FeedChromeController? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<FeedChrome>()?.notifier;

  /// The controller without listening to it (scroll callbacks: a scroll
  /// frame must not rebuild the list).
  static FeedChromeController? read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<FeedChrome>()?.notifier;
}

/// The stable card height the feed screen measured, if any (no rebuilds).
double? feedChromeCardHeight(BuildContext context) =>
    context.getInheritedWidgetOfExactType<FeedChrome>()?.notifier?.cardHeight;

/// Slides [child] up and out (height to zero) as the feed chrome hides,
/// following the scroll.
class ChromeCollapse extends StatelessWidget {
  const ChromeCollapse({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final controller = FeedChrome.maybeOf(context);
    if (controller != null) {
      controller.reduceMotion = MediaQuery.disableAnimationsOf(context);
    }
    final shown = controller?.shown ?? 1;
    return ClipRect(
      child: Align(
        alignment: Alignment.bottomCenter,
        heightFactor: shown,
        child: controller == null
            ? child
            : _MeasureHeight(controller: controller, child: child),
      ),
    );
  }
}

/// Tells the controller the rows' full height on each layout.
class _MeasureHeight extends SingleChildRenderObjectWidget {
  const _MeasureHeight({required this.controller, super.child});

  final FeedChromeController controller;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderMeasureHeight(controller);

  @override
  void updateRenderObject(
    BuildContext context,
    _RenderMeasureHeight renderObject,
  ) =>
      renderObject.controller = controller;
}

class _RenderMeasureHeight extends RenderProxyBox {
  _RenderMeasureHeight(this.controller);

  FeedChromeController controller;

  @override
  void performLayout() {
    super.performLayout();
    controller.extent = size.height;
  }
}
