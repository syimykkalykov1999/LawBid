import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// Owner 2026-10-26 (exactly like WhatsApp / FaceTime): the small picture
/// of a 1:1 video call — a 96 × 136 card with soft corners in a corner of
/// the screen. Drag it anywhere; let go and it springs to the nearest
/// corner (a fling picks the corner it was thrown towards). Two taps swap
/// it with the big picture; one tap shows / hides the controls like a tap
/// anywhere else. Where it rests is kept in [callVideoLayoutProvider], so
/// it stays put when the screen is closed and opened again. It moves out
/// of the way of the controls (above the sheet while it shows, down to the
/// edge while it is hidden).
class CallPipWindow extends ConsumerStatefulWidget {
  const CallPipWindow({
    required this.stream,
    required this.mirror,
    required this.onSwap,
    required this.onTap,
    this.topInset = 0,
    this.bottomInset = 0,
    super.key,
  });

  static const size = Size(96, 136);

  final MediaStream stream;
  final bool mirror;

  /// Two taps: this picture becomes the big one.
  final VoidCallback onSwap;

  /// One tap: show / hide the controls.
  final VoidCallback onTap;

  /// Room kept free above / below it (the top line, the control sheet).
  final double topInset;
  final double bottomInset;

  @override
  ConsumerState<CallPipWindow> createState() => _CallPipWindowState();
}

class _CallPipWindowState extends ConsumerState<CallPipWindow>
    with TickerProviderStateMixin {
  // WhatsApp-like: quick, a touch of give, no wobble.
  static const _spring =
      SpringDescription(mass: 1, stiffness: 520, damping: 40);
  static const _margin = 12.0;

  late final AnimationController _x =
      AnimationController.unbounded(vsync: this);
  late final AnimationController _y =
      AnimationController.unbounded(vsync: this);
  bool _placed = false;
  bool _dragging = false;
  Size _area = Size.zero;
  Offset? _target;

  @override
  void dispose() {
    _x.dispose();
    _y.dispose();
    super.dispose();
  }

  Offset _rest(PipCorner corner, Size area, bool rtl) {
    const size = CallPipWindow.size;
    final right = switch (corner) {
      PipCorner.topEnd || PipCorner.bottomEnd => !rtl,
      PipCorner.topStart || PipCorner.bottomStart => rtl,
    };
    final top = corner == PipCorner.topEnd || corner == PipCorner.topStart;
    return Offset(
      right ? area.width - size.width - _margin : _margin,
      top ? widget.topInset : area.height - size.height - widget.bottomInset,
    );
  }

  PipCorner _nearest(Offset center, Size area, bool rtl) {
    final right = center.dx > area.width / 2;
    final top = center.dy < area.height / 2;
    final end = rtl ? !right : right;
    return top
        ? (end ? PipCorner.topEnd : PipCorner.topStart)
        : (end ? PipCorner.bottomEnd : PipCorner.bottomStart);
  }

  void _springTo(Offset to, {Offset velocity = Offset.zero}) {
    if (context.reduceMotion) {
      _x.value = to.dx;
      _y.value = to.dy;
      return;
    }
    _x.animateWith(SpringSimulation(_spring, _x.value, to.dx, velocity.dx));
    _y.animateWith(SpringSimulation(_spring, _y.value, to.dy, velocity.dy));
  }

  @override
  Widget build(BuildContext context) {
    final layout = ref.watch(callVideoLayoutProvider);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return LayoutBuilder(
      builder: (context, box) {
        _area = box.biggest;
        final rest = _rest(layout.corner, _area, rtl);
        if (!_placed) {
          _placed = true;
          _x.value = rest.dx;
          _y.value = rest.dy;
          _target = rest;
        } else if (!_dragging && _target != rest) {
          // The sheet came or went, or the corner changed: glide there.
          _target = rest;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && !_dragging) _springTo(rest);
          });
        }
        return Stack(
          children: [
            AnimatedBuilder(
              animation: Listenable.merge([_x, _y]),
              builder: (context, child) => Positioned(
                left: _x.value,
                top: _y.value,
                width: CallPipWindow.size.width,
                height: CallPipWindow.size.height,
                child: child!,
              ),
              child: GestureDetector(
                key: const Key('call-pip-swap'),
                behavior: HitTestBehavior.opaque,
                onTap: widget.onTap,
                onDoubleTap: widget.onSwap,
                onPanStart: (_) {
                  _dragging = true;
                  _x.stop();
                  _y.stop();
                },
                onPanUpdate: (d) {
                  _x.value = (_x.value + d.delta.dx)
                      .clamp(0, _area.width - CallPipWindow.size.width);
                  _y.value = (_y.value + d.delta.dy)
                      .clamp(0, _area.height - CallPipWindow.size.height);
                },
                onPanEnd: (d) {
                  _dragging = false;
                  final v = d.velocity.pixelsPerSecond;
                  // Where a throw would carry it, a fifth of a second on.
                  final aim = Offset(_x.value, _y.value) +
                      v * 0.2 +
                      CallPipWindow.size.center(Offset.zero);
                  final corner = _nearest(aim, _area, rtl);
                  final to = _rest(corner, _area, rtl);
                  _target = to;
                  ref.read(callVideoLayoutProvider.notifier).moveTo(corner);
                  _springTo(to, velocity: v);
                },
                child: RepaintBoundary(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: const [
                        BoxShadow(
                          color: Colors.black45,
                          blurRadius: 12,
                          offset: Offset(0, 4),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          const ColoredBox(color: AppCallColors.tileOff),
                          CallVideoView(
                            stream: widget.stream,
                            mirror: widget.mirror,
                          ),
                          DecoratedBox(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.15),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
