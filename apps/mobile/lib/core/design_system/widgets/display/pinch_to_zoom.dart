import 'dart:ui' show lerpDouble;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Owner 2026-10-19 (Instagram): pinch a photo or a video right in a list —
/// it lifts out of its card over everything else (the screen dims behind
/// it), follows both fingers (zoom and move), and glides back into place
/// when the fingers let go. One finger never zooms, so scrolling, page
/// swipes, taps, double taps and long presses work as before.
///
/// [overlayBuilder] draws the lifted copy (a video passes a second view of
/// the same player, so it keeps playing); without it [child] is drawn
/// again.
class PinchToZoom extends StatefulWidget {
  const PinchToZoom({
    required this.child,
    this.overlayBuilder,
    this.enabled = true,
    this.maxScale = 4,
    super.key,
  });

  final Widget child;
  final WidgetBuilder? overlayBuilder;
  final bool enabled;
  final double maxScale;

  @override
  State<PinchToZoom> createState() => _PinchToZoomState();
}

class _PinchToZoomState extends State<PinchToZoom>
    with SingleTickerProviderStateMixin {
  final _box = GlobalKey();
  OverlayEntry? _entry;
  Rect _rect = Rect.zero;
  Offset _startFocal = Offset.zero;
  final _focal = ValueNotifier<Offset>(Offset.zero);
  final _scale = ValueNotifier<double>(1);

  late final AnimationController _back = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  )..addListener(_backTick);
  Offset _releaseFocal = Offset.zero;
  double _releaseScale = 1;

  void _start(Offset focal) {
    if (_entry != null) {
      // Pinched again while gliding back: start over from its place.
      _back.stop();
      _entry!.remove();
      _entry = null;
    }
    final box = _box.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    _rect = box.localToGlobal(Offset.zero) & box.size;
    _startFocal = focal;
    _focal.value = focal;
    _scale.value = 1;
    _entry = OverlayEntry(builder: _buildOverlay);
    Overlay.of(context, rootOverlay: true).insert(_entry!);
    AppHaptics.selection();
    setState(() {});
  }

  void _update(Offset focal, double scale) {
    if (_entry == null || _back.isAnimating) return;
    _focal.value = focal;
    _scale.value = scale.clamp(1, widget.maxScale);
  }

  void _end() {
    if (_entry == null) return;
    _releaseFocal = _focal.value;
    _releaseScale = _scale.value;
    if (context.reduceMotion) {
      _remove();
    } else {
      _back.forward(from: 0);
    }
  }

  void _backTick() {
    final v = Curves.easeOutCubic.transform(_back.value);
    _focal.value = Offset.lerp(_releaseFocal, _startFocal, v)!;
    _scale.value = lerpDouble(_releaseScale, 1, v)!;
    if (_back.isCompleted) _remove();
  }

  void _remove() {
    _entry?.remove();
    _entry = null;
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _entry?.remove();
    _entry = null;
    _back.dispose();
    _focal.dispose();
    _scale.dispose();
    super.dispose();
  }

  Widget _buildOverlay(BuildContext context) => IgnorePointer(
        child: AnimatedBuilder(
          animation: Listenable.merge([_focal, _scale]),
          builder: (context, child) {
            final s = _scale.value;
            final dim = ((s - 1) / 1.5).clamp(0.0, 1.0) * 0.6;
            // A point p of the picture goes to: focal + (p − startFocal)·s.
            final local = _startFocal - _rect.topLeft;
            final m = Matrix4.identity()
              ..translateByDouble(
                _focal.value.dx - _rect.left,
                _focal.value.dy - _rect.top,
                0,
                1,
              )
              ..scaleByDouble(s, s, 1, 1)
              ..translateByDouble(-local.dx, -local.dy, 0, 1);
            return Stack(
              children: [
                Positioned.fill(
                  child: ColoredBox(color: Colors.black.withValues(alpha: dim)),
                ),
                Positioned.fromRect(
                  rect: _rect,
                  child: Transform(transform: m, child: child),
                ),
              ],
            );
          },
          child: (widget.overlayBuilder ?? (_) => widget.child)(context),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final lifted = _entry != null;
    final content = KeyedSubtree(
      key: _box,
      // The copy in the overlay stands in for it while it is lifted.
      child: Opacity(opacity: lifted ? 0 : 1, child: widget.child),
    );
    if (!widget.enabled) return content;
    return RawGestureDetector(
      behavior: HitTestBehavior.translucent,
      gestures: {
        _PinchRecognizer:
            GestureRecognizerFactoryWithHandlers<_PinchRecognizer>(
          _PinchRecognizer.new,
          (r) => r
            ..onStart = _start
            ..onUpdate = _update
            ..onEnd = _end,
        ),
      },
      child: content,
    );
  }
}

/// Claims the pointers only when a second finger lands (before a scroll or
/// a page swipe has won with the first); a single finger is always given
/// up, so taps, double taps and drags of the widgets around keep working.
class _PinchRecognizer extends OneSequenceGestureRecognizer {
  void Function(Offset focal)? onStart;
  void Function(Offset focal, double scale)? onUpdate;
  VoidCallback? onEnd;

  final Map<int, Offset> _points = {};
  bool _active = false;
  double _startSpan = 0;
  double _currentScale = 1;

  @override
  String get debugDescription => 'pinch to zoom';

  @override
  void addAllowedPointer(PointerDownEvent event) {
    startTrackingPointer(event.pointer, event.transform);
    _points[event.pointer] = event.position;
    if (!_active && _points.length >= 2) {
      resolve(GestureDisposition.accepted);
      _active = true;
      _currentScale = 1;
      _startSpan = _span();
      onStart?.call(_centre());
    } else if (_active) {
      // A third finger: the zoom stays where it is.
      _startSpan = _span() / _currentScale;
    }
  }

  Offset _centre() {
    var sum = Offset.zero;
    for (final p in _points.values) {
      sum += p;
    }
    return sum / _points.length.toDouble();
  }

  double _span() {
    final c = _centre();
    var total = 0.0;
    for (final p in _points.values) {
      total += (p - c).distance;
    }
    return total / _points.length;
  }

  @override
  void handleEvent(PointerEvent event) {
    if (event is PointerMoveEvent) {
      _points[event.pointer] = event.position;
      if (_active && _points.length >= 2 && _startSpan > 0) {
        _currentScale = _span() / _startSpan;
        onUpdate?.call(_centre(), _currentScale);
      }
    } else if (event is PointerUpEvent || event is PointerCancelEvent) {
      _points.remove(event.pointer);
      if (!_active) {
        // A lone finger lifted: it belongs to the tap / double tap.
        resolvePointer(event.pointer, GestureDisposition.rejected);
      } else if (_points.length < 2) {
        _finish();
      }
      stopTrackingPointer(event.pointer);
    }
  }

  void _finish() {
    if (!_active) return;
    _active = false;
    onEnd?.call();
  }

  @override
  void rejectGesture(int pointer) {
    _points.remove(pointer);
    stopTrackingPointer(pointer);
  }

  @override
  void didStopTrackingLastPointer(int pointer) {
    _finish();
    _points.clear();
  }
}
