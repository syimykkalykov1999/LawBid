import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-20 (Telegram): a strip above a list that is folded by
/// default, opens when the list is pulled down at the top, and folds away
/// again while the list is scrolled down. [pinned] stays put under it; [body]
/// holds the scrolling list.
class CollapsingHeader extends StatefulWidget {
  const CollapsingHeader({
    required this.collapsible,
    required this.body,
    this.pinned,
    this.initiallyShown = false,
    super.key,
  });

  final Widget collapsible;
  final Widget? pinned;
  final Widget body;
  final bool initiallyShown;

  /// Scrolling less than this does not flip the strip.
  static const double threshold = 6;

  /// An upward drag of this many dp folds the strip even over a list that
  /// does not scroll.
  static const double dragUp = 12;

  /// A list that can scroll only this little never folds the strip (the
  /// freed height would leave nothing to scroll back with).
  static const double minScrollable = 160;

  @override
  State<CollapsingHeader> createState() => _CollapsingHeaderState();
}

class _CollapsingHeaderState extends State<CollapsingHeader> {
  late bool _shown = widget.initiallyShown;

  bool _onScroll(ScrollNotification n) {
    if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
    final m = n.metrics;
    // A pull past the top (clamped lists report it as an overscroll, bouncing
    // ones as a negative position) opens the strip.
    if (n is OverscrollNotification &&
        n.overscroll < 0 &&
        n.dragDetails != null) {
      _set(true);
    } else if (n is ScrollUpdateNotification) {
      final delta = n.scrollDelta ?? 0;
      if (m.pixels < 0) {
        _set(true);
      } else if (delta > CollapsingHeader.threshold &&
          m.maxScrollExtent > CollapsingHeader.minScrollable) {
        _set(false);
      }
    }
    return false;
  }

  // Owner 2026-10-20 (Mac): a list too short to scroll still folds the strip —
  // an upward drag over it, or a tap on a row, closes it.
  double _drag = 0;

  void _pointerMove(PointerMoveEvent e) {
    _drag += e.delta.dy;
    if (_drag < -CollapsingHeader.dragUp) _set(false);
  }

  void _pointerUp(PointerUpEvent e) {
    if (_drag.abs() < CollapsingHeader.threshold) _set(false);
    _drag = 0;
  }

  void _set(bool shown) {
    if (shown != _shown) setState(() => _shown = shown);
  }

  @override
  Widget build(BuildContext context) {
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Column(
      children: [
        ClipRect(
          child: AnimatedAlign(
            key: const ValueKey('collapsing-header'),
            duration: dur,
            curve: Curves.easeOutCubic,
            alignment: AlignmentDirectional.topStart,
            heightFactor: _shown ? 1 : 0,
            child: widget.collapsible,
          ),
        ),
        if (widget.pinned != null) widget.pinned!,
        Expanded(
          child: Listener(
            onPointerDown: (_) => _drag = 0,
            onPointerMove: _pointerMove,
            onPointerUp: _pointerUp,
            onPointerCancel: (_) => _drag = 0,
            child: NotificationListener<ScrollNotification>(
              onNotification: _onScroll,
              child: widget.body,
            ),
          ),
        ),
      ],
    );
  }
}
