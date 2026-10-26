import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

/// Width of the zone at each side of a row where a swipe belongs to the row.
const double kEdgeSwipeZone = 32;

const double _kRevealMax = 96;
const double _kTrigger = 72;

class _EdgeDrag extends HorizontalDragGestureRecognizer {
  _EdgeDrag(this.allows);

  final bool Function(Offset global) allows;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    if (allows(event.position)) super.addAllowedPointer(event);
  }
}

/// Owner 2026-10-20: row actions (pin / mute, done / tomorrow …) come only
/// from the two edges of a row ([kEdgeSwipeZone]). A horizontal swipe that
/// starts anywhere else is not taken here, so the page view around the list
/// changes the section (Chats · Requests · Team …) as on an empty spot.
///
/// A swipe from the leading edge towards the end calls [onStart] (its
/// [startBackground] shows behind the row); from the trailing edge towards
/// the start it calls [onEnd]. The row springs back; the action is the
/// caller's. A null action turns that side off.
class EdgeSwipe extends StatefulWidget {
  const EdgeSwipe({
    required this.startBackground,
    required this.endBackground,
    required this.child,
    this.onStart,
    this.onEnd,
    super.key,
  });

  final VoidCallback? onStart;
  final VoidCallback? onEnd;
  final Widget startBackground;
  final Widget endBackground;
  final Widget child;

  @override
  State<EdgeSwipe> createState() => _EdgeSwipeState();
}

class _EdgeSwipeState extends State<EdgeSwipe>
    with SingleTickerProviderStateMixin {
  late final AnimationController _back = AnimationController.unbounded(
    vsync: this,
  );

  /// Distance dragged towards the end of the row (negative: towards the
  /// start), in logical pixels regardless of the text direction.
  double _offset = 0;

  /// The drag began at the row's leading edge.
  bool _fromStart = true;

  @override
  void initState() {
    super.initState();
    _back.addListener(() => setState(() => _offset = _back.value));
  }

  @override
  void dispose() {
    _back.dispose();
    super.dispose();
  }

  bool get _rtl => Directionality.of(context) == TextDirection.rtl;

  bool _allows(Offset global) {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return false;
    final x = box.globalToLocal(global).dx;
    final leftEdge = x <= kEdgeSwipeZone;
    final rightEdge = x >= box.size.width - kEdgeSwipeZone;
    if (!leftEdge && !rightEdge) return false;
    final atStart = _rtl ? rightEdge : leftEdge;
    return atStart ? widget.onStart != null : widget.onEnd != null;
  }

  void _start(DragStartDetails d) {
    _back.stop();
    final box = context.findRenderObject()! as RenderBox;
    final leftEdge =
        box.globalToLocal(d.globalPosition).dx <= box.size.width / 2;
    _fromStart = _rtl ? !leftEdge : leftEdge;
  }

  void _update(DragUpdateDetails d) {
    final next = _offset + (_rtl ? -d.delta.dx : d.delta.dx);
    setState(() {
      _offset = _fromStart
          ? next.clamp(0, _kRevealMax).toDouble()
          : next.clamp(-_kRevealMax, 0).toDouble();
    });
  }

  void _end(DragEndDetails d) {
    final v = (d.primaryVelocity ?? 0) * (_rtl ? -1 : 1);
    final fling = _fromStart ? v > 900 : v < -900;
    if (_offset.abs() >= _kTrigger || (fling && _offset != 0)) {
      (_fromStart ? widget.onStart : widget.onEnd)?.call();
    }
    _back
      ..value = _offset
      ..animateTo(
        0,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
  }

  @override
  Widget build(BuildContext context) => RawGestureDetector(
        behavior: HitTestBehavior.translucent,
        gestures: {
          _EdgeDrag: GestureRecognizerFactoryWithHandlers<_EdgeDrag>(
            () => _EdgeDrag(_allows),
            (r) => r
              ..onStart = _start
              ..onUpdate = _update
              ..onEnd = _end
              ..onCancel = () => _end(DragEndDetails()),
          ),
        },
        child: Stack(
          children: [
            if (_offset != 0)
              Positioned.fill(
                child:
                    _offset > 0 ? widget.startBackground : widget.endBackground,
              ),
            Transform.translate(
              offset: Offset(_offset * (_rtl ? -1 : 1), 0),
              child: widget.child,
            ),
          ],
        ),
      );
}
