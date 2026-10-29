import 'dart:async';

import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;
import 'package:flutter/material.dart';

/// The one pull-to-refresh of the app (owner 2026-10-28, Samsung: a tiny pull
/// started the refresh with the spinner in the middle of the screen).
///
/// Behaves like Instagram / Telegram / WhatsApp:
///  * only a pull that STARTS with the list at its very top counts, and only
///    a vertical one at the outermost scrollable (a horizontal swipe, a
///    nested page list, a pull that began mid-list never refreshes);
///  * the refresh fires only after a deliberate pull of [triggerDistance]
///    logical px (default 90) is released; a smaller pull just springs back;
///  * the spinner lives at the top edge of the area (below the app bar), at
///    [edgeOffset] + [displacement], never over the content;
///  * Android: a Material spinner dragged down with resistance; iOS: the
///    native bouncing list plus the Cupertino spinner.
///
/// Keep using this instead of [RefreshIndicator] (an architecture test
/// guards it). [AppRefreshIndicatorState.show] refreshes programmatically.
class AppRefreshIndicator extends StatefulWidget {
  const AppRefreshIndicator({
    required this.onRefresh,
    required this.child,
    this.color,
    this.backgroundColor,
    this.edgeOffset = 0,
    this.displacement = 16,
    this.triggerDistance = defaultTriggerDistance,
    this.notificationPredicate = defaultScrollNotificationPredicate,
    super.key,
  });

  /// Overscroll (px) a pull must reach before releasing refreshes.
  static const double defaultTriggerDistance = 90;

  /// Spinner size on Android.
  static const double circleSize = 40;

  final Future<void> Function() onRefresh;
  final Widget child;
  final Color? color;
  final Color? backgroundColor;

  /// Distance of the area's top to the spinner's resting line (under a
  /// transparent bar, say).
  final double edgeOffset;

  /// Gap between [edgeOffset] and the top of the resting spinner.
  final double displacement;

  final double triggerDistance;

  /// Which scrollables count (default: the outermost, vertical one).
  final ScrollNotificationPredicate notificationPredicate;

  @override
  State<AppRefreshIndicator> createState() => AppRefreshIndicatorState();
}

class AppRefreshIndicatorState extends State<AppRefreshIndicator>
    with SingleTickerProviderStateMixin {
  /// How much of the finger travel past the edge reaches the spinner.
  static const double _resistance = 0.5;

  late final AnimationController _settle = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );

  /// Raw overscroll of the current pull (px).
  double _pull = 0;
  bool _tracking = false;
  bool _refreshing = false;

  /// Fingers on the screen. A NestedScrollView hands the drag to its inner
  /// list, so the outer scrollable's notifications carry no drag details:
  /// the pointers tell "a finger is pulling", not the notification.
  int _pointers = 0;

  /// What the spinner shows: pull px while dragging, animated back to 0
  /// (or held at the trigger distance while refreshing).
  double _shown = 0;
  Animation<double>? _anim;

  @override
  void initState() {
    super.initState();
    _settle.addListener(() {
      final a = _anim;
      if (a != null && mounted) setState(() => _shown = a.value);
    });
  }

  @override
  void dispose() {
    _settle.dispose();
    super.dispose();
  }

  void _animateShown(double to) {
    _anim = Tween<double>(begin: _shown, end: to)
        .chain(CurveTween(curve: Curves.easeOutCubic))
        .animate(_settle);
    _settle
      ..reset()
      ..forward();
  }

  /// The outermost scrollable is at its start (a NestedScrollView's header
  /// has not scrolled away); only then can a pull of an inner list count.
  bool _outerAtTop = true;

  bool _onNotification(ScrollNotification n) {
    if (n.depth == 0 && n.metrics.axis == Axis.vertical) {
      _outerAtTop = n.metrics.pixels <= n.metrics.minScrollExtent + 0.5;
      if (!_outerAtTop && _tracking) {
        _tracking = false;
        _setPull(0);
      }
    }
    if (!widget.notificationPredicate(n)) return false;
    if (n.metrics.axis != Axis.vertical ||
        n.metrics.axisDirection != AxisDirection.down) {
      return false;
    }
    if (_refreshing) return false;
    final m = n.metrics;
    final atTop = m.pixels <= m.minScrollExtent + 0.5;

    if (n is ScrollStartNotification) {
      _tracking = _pointers > 0 && atTop && _outerAtTop;
      _pull = 0;
      if (_tracking) _settle.stop();
    } else if (n is OverscrollNotification) {
      if (_tracking && _pointers > 0 && n.overscroll < 0) {
        _setPull(_pull - n.overscroll);
      } else if (_tracking && _pointers == 0) {
        _release();
      }
    } else if (n is ScrollUpdateNotification) {
      if (!_tracking) return false;
      if (_pointers == 0) {
        _release();
      } else if (m.pixels < m.minScrollExtent) {
        // iOS bounce: the list itself is pulled past the edge.
        _setPull(m.minScrollExtent - m.pixels);
      } else if (!atTop) {
        // Scrolled away from the top: no longer a pull-to-refresh gesture.
        _tracking = false;
        _setPull(0);
      } else {
        // Dragging back up through the edge shrinks the pull.
        _setPull(_pull - (n.scrollDelta ?? 0).clamp(0, double.infinity));
      }
    } else if (n is ScrollEndNotification) {
      if (_tracking) _release();
    }
    return false;
  }

  void _pointerGone(PointerEvent _) {
    if (_pointers > 0) _pointers--;
    if (_pointers == 0 && _tracking) _release();
  }

  void _setPull(double v) {
    _pull = v < 0 ? 0 : v;
    _settle.stop();
    setState(() => _shown = _pull);
  }

  void _release() {
    final fire = _pull >= widget.triggerDistance;
    _tracking = false;
    _pull = 0;
    if (fire) {
      unawaited(_run());
    } else if (_shown > 0) {
      _animateShown(0);
    }
  }

  Future<void> _run() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    _animateShown(widget.triggerDistance);
    try {
      await widget.onRefresh();
    } finally {
      if (mounted) {
        setState(() => _refreshing = false);
        _animateShown(0);
      }
    }
  }

  /// Runs the refresh with the spinner visible (a tap on the open tab).
  Future<void> show() async {
    if (_refreshing || !mounted) return;
    await _run();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ios = theme.platform == TargetPlatform.iOS;
    final t = (_shown / widget.triggerDistance).clamp(0.0, 1.0);
    return Stack(
      children: [
        Listener(
          onPointerDown: (_) => _pointers++,
          onPointerUp: _pointerGone,
          onPointerCancel: _pointerGone,
          child: NotificationListener<ScrollNotification>(
            onNotification: _onNotification,
            child: widget.child,
          ),
        ),
        if (_shown > 0 || _refreshing)
          Positioned(
            top: widget.edgeOffset,
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: ios ? _cupertino(t) : _material(theme, t),
            ),
          ),
      ],
    );
  }

  Widget _material(ThemeData theme, double t) {
    const size = AppRefreshIndicator.circleSize;
    // Slides in from above the edge to the resting line, then follows the
    // finger a little further, with resistance.
    final over = (_shown - widget.triggerDistance).clamp(0.0, 200.0);
    final dy = -size +
        (size + widget.displacement) * Curves.easeOut.transform(t) +
        over * _resistance * 0.4;
    return Transform.translate(
      offset: Offset(0, dy),
      child: Align(
        alignment: Alignment.topCenter,
        child: Opacity(
          opacity: t,
          child: Material(
            type: MaterialType.circle,
            elevation: 2,
            color: widget.backgroundColor ?? theme.canvasColor,
            child: SizedBox.square(
              dimension: size,
              child: Padding(
                padding: const EdgeInsets.all(9),
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: widget.color,
                  value: _refreshing ? null : t * 0.85,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _cupertino(double t) => Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: EdgeInsets.only(top: widget.displacement),
          child: Opacity(
            opacity: t,
            child: _refreshing
                ? CupertinoActivityIndicator(color: widget.color)
                : CupertinoActivityIndicator.partiallyRevealed(
                    progress: t,
                  ),
          ),
        ),
      );
}

/// For a NestedScrollView whose body is a PageView of lists (the profile):
/// the pull is delivered by the inner list, through the outer viewport and
/// the pages' viewport. Whether the header is back at the top is checked
/// from the outer scrollable.
bool nestedScrollNotificationPredicate(ScrollNotification n) =>
    n.depth <= 2 && n.metrics.axis == Axis.vertical;

/// Default for [AppRefreshIndicator.notificationPredicate]: the outermost
/// scrollable only (a nested page list never starts a refresh by itself).
bool defaultScrollNotificationPredicate(ScrollNotification n) => n.depth == 0;
