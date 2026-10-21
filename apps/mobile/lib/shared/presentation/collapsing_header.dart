import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// How far the strip under [CollapsingHeader.pinned] is open.
enum StripStage { hidden, hint, open }

/// Owner 2026-10-20 (Telegram): a strip under the pinned bar, hidden by
/// default. Opening takes two deliberate pulls, so it never pops up while
/// someone just scrolls back to the top: the first pull-down at the very
/// top of the list (past [pullDistance], finger still on the screen) shows
/// the small [hint]; a second, separate pull (or a tap on the hint) opens
/// the whole [collapsible]. A flick or inertia that merely reaches the top
/// opens nothing. Any scroll down, an upward drag or a tap on a row hides it.
class CollapsingHeader extends StatefulWidget {
  const CollapsingHeader({
    required this.collapsible,
    required this.body,
    this.hint,
    this.pinned,
    this.initiallyShown = false,
    super.key,
  });

  final Widget collapsible;

  /// The small folded teaser (no hint: one pull opens the strip).
  final Widget? hint;

  /// Stays put above the strip.
  final Widget? pinned;
  final Widget body;
  final bool initiallyShown;

  /// Scrolling less than this does not flip the strip.
  static const double threshold = 6;

  /// One pull past the top must be at least this long to count.
  static const double pullDistance = 60;

  /// An upward drag of this many dp hides the strip even over a list that
  /// does not scroll.
  static const double dragUp = 12;

  /// A list that can scroll only this little never hides the strip on scroll
  /// (the freed height would leave nothing to scroll back with).
  static const double minScrollable = 160;

  @override
  State<CollapsingHeader> createState() => _CollapsingHeaderState();
}

class _CollapsingHeaderState extends State<CollapsingHeader> {
  late StripStage _stage =
      widget.initiallyShown ? StripStage.open : StripStage.hidden;

  /// How far the finger has pulled past the top in the current touch.
  double _pull = 0;

  /// Net vertical finger travel in the current touch.
  double _drag = 0;

  bool _onScroll(ScrollNotification n) {
    if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
    final m = n.metrics;
    // Only a finger counts: inertia reaching the top has no drag details.
    if (n is OverscrollNotification && n.dragDetails != null) {
      if (n.overscroll < 0) _pull += -n.overscroll;
    } else if (n is ScrollUpdateNotification) {
      final delta = n.scrollDelta ?? 0;
      if (n.dragDetails != null && m.pixels < 0) {
        // Bouncing lists report the pull as a negative position.
        if (-m.pixels > _pull) _pull = -m.pixels;
      } else if (delta > CollapsingHeader.threshold &&
          m.maxScrollExtent > CollapsingHeader.minScrollable) {
        _set(StripStage.hidden);
      }
    }
    return false;
  }

  void _pointerMove(PointerMoveEvent e) {
    _drag += e.delta.dy;
    if (_drag < -CollapsingHeader.dragUp) _set(StripStage.hidden);
  }

  void _pointerEnd({required bool up}) {
    if (_pull >= CollapsingHeader.pullDistance) {
      // One touch is one step, however long the pull.
      _set(
        _stage == StripStage.hidden && widget.hint != null
            ? StripStage.hint
            : StripStage.open,
      );
    } else if (up && _drag.abs() < CollapsingHeader.threshold) {
      _set(StripStage.hidden);
    }
    _pull = 0;
    _drag = 0;
  }

  void _set(StripStage stage) {
    if (stage != _stage) setState(() => _stage = stage);
  }

  @override
  Widget build(BuildContext context) {
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Column(
      children: [
        if (widget.pinned != null) widget.pinned!,
        if (widget.hint != null)
          ClipRect(
            child: AnimatedAlign(
              key: const ValueKey('collapsing-hint'),
              duration: dur,
              curve: Curves.easeOutCubic,
              alignment: AlignmentDirectional.topStart,
              heightFactor: _stage == StripStage.hint ? 1 : 0,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => _set(StripStage.open),
                child: widget.hint,
              ),
            ),
          ),
        ClipRect(
          child: AnimatedAlign(
            key: const ValueKey('collapsing-header'),
            duration: dur,
            curve: Curves.easeOutCubic,
            alignment: AlignmentDirectional.topStart,
            heightFactor: _stage == StripStage.open ? 1 : 0,
            child: widget.collapsible,
          ),
        ),
        Expanded(
          child: Listener(
            onPointerDown: (_) {
              _pull = 0;
              _drag = 0;
            },
            onPointerMove: _pointerMove,
            onPointerUp: (_) => _pointerEnd(up: true),
            onPointerCancel: (_) => _pointerEnd(up: false),
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
