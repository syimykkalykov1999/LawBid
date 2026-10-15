import 'package:flutter/material.dart';

/// Owner 2026-10-12: the feed's top rows (Posts | Cases and the filter
/// chips) slide away when the list is scrolled down and come back only at
/// the very top of the list (the Feed tab button scrolls there).
/// row wrapped in [ChromeCollapse] follows it, anywhere else it stays.
class FeedChromeController extends ChangeNotifier {
  FeedChromeController({this.revealOnUp = false});

  /// Owner 2026-10-15 («Mine», like Instagram's header): scrolling up shows
  /// the rows again at once, not only at the very top of the list.
  final bool revealOnUp;

  bool _visible = true;
  double _run = 0;

  /// Card height the feed lists use, kept stable while the rows hide so the
  /// cards do not resize during a scroll. Null = measure the list.
  double? cardHeight;

  bool get visible => _visible;

  void show() {
    _run = 0;
    if (_visible) return;
    _visible = true;
    notifyListeners();
  }

  /// Feed this the vertical scroll notifications of the lists below.
  bool onScroll(ScrollNotification n) {
    if (n.metrics.axis != Axis.vertical) return false;
    if (n.metrics.pixels <= 0) {
      show();
      return false;
    }
    if (n is ScrollUpdateNotification && n.dragDetails != null) {
      final d = n.scrollDelta ?? 0;
      // A change of direction starts a new run.
      if ((d > 0) != (_run > 0)) _run = 0;
      _run += d;
      // Owner 2026-10-12: once hidden the rows stay away while scrolling
      // up; they return at the very top (or on the Feed tab button).
      if (revealOnUp && _run < -24 && !_visible) {
        show();
        return false;
      }
      if (_run > 24 && _visible) {
        _visible = false;
        notifyListeners();
      }
    }
    return false;
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
}

/// The stable card height the feed screen measured, if any (no rebuilds).
double? feedChromeCardHeight(BuildContext context) =>
    context.getInheritedWidgetOfExactType<FeedChrome>()?.notifier?.cardHeight;

/// Slides [child] up and out (height to zero) when the feed chrome hides.
class ChromeCollapse extends StatelessWidget {
  const ChromeCollapse({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final visible = FeedChrome.maybeOf(context)?.visible ?? true;
    final instant = MediaQuery.disableAnimationsOf(context);
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(end: visible ? 1 : 0),
      duration: instant ? Duration.zero : const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (context, v, child) => ClipRect(
        child: Align(
          alignment: Alignment.bottomCenter,
          heightFactor: v,
          child: child,
        ),
      ),
    );
  }
}

/// Fades [child] out (and makes it untouchable) while the feed chrome is
/// hidden; the space it takes stays, so nothing around it moves.
class ChromeFade extends StatelessWidget {
  const ChromeFade({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final visible = FeedChrome.maybeOf(context)?.visible ?? true;
    final instant = MediaQuery.disableAnimationsOf(context);
    return IgnorePointer(
      ignoring: !visible,
      child: AnimatedOpacity(
        opacity: visible ? 1 : 0,
        duration: instant ? Duration.zero : const Duration(milliseconds: 200),
        child: child,
      ),
    );
  }
}
