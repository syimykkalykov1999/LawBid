import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// Owner 2026-10-26 (exactly like WhatsApp / FaceTime): the small picture
/// of a 1:1 video call — a 96 × 136 card with soft corners in a corner of
/// the screen. Drag it anywhere; let go and it springs to the nearest
/// corner (a fling picks the corner it was thrown towards) with a light
/// tick of haptics. Two taps swap it with the big picture: the card grows
/// from its corner to the whole screen (300 ms), the pictures change places
/// underneath (the same two renderers — nothing restarts, nothing goes
/// black) and the card fades back in at its corner. One tap shows / hides
/// the controls like a tap anywhere else. Where it rests is kept in
/// [callVideoLayoutProvider], so it stays put when the screen is closed and
/// opened again. It moves out of the way of the controls (above the sheet
/// while it shows, down to the edge while it is hidden).
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
  static const double radius = 14;

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

  /// The swap: 0 = the card in its corner, 1 = grown over the whole screen.
  late final AnimationController _grow = AnimationController(
    vsync: this,
    duration: CallMotion.layout,
  );

  /// The card's own opacity: it fades back in after a swap.
  late final AnimationController _appear = AnimationController(
    vsync: this,
    duration: CallMotion.quick,
    value: 1,
  );
  bool _placed = false;
  bool _dragging = false;
  Size _area = Size.zero;
  Offset? _target;

  @override
  void dispose() {
    _x.dispose();
    _y.dispose();
    _grow.dispose();
    _appear.dispose();
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

  /// UI-03 (WhatsApp): the card grows to fill the screen, then the pictures
  /// swap underneath and the card comes back to its corner.
  Future<void> _swap() async {
    if (_grow.isAnimating || _dragging) return;
    if (context.reduceMotion) {
      widget.onSwap();
      return;
    }
    await _grow.forward(from: 0);
    if (!mounted) return;
    widget.onSwap();
    _grow.value = 0;
    unawaited(_appear.forward(from: 0));
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
        // The picture itself never changes identity: the renderer lives on
        // through every drag, snap and swap.
        final picture = RepaintBoundary(
          child: CallVideoView(stream: widget.stream, mirror: widget.mirror),
        );
        return Stack(
          children: [
            AnimatedBuilder(
              animation: Listenable.merge([_x, _y, _grow, _appear]),
              builder: (context, child) {
                final t = CallMotion.curve.transform(_grow.value);
                final rect = Rect.lerp(
                  Rect.fromLTWH(
                    _x.value,
                    _y.value,
                    CallPipWindow.size.width,
                    CallPipWindow.size.height,
                  ),
                  Offset.zero & _area,
                  t,
                )!;
                final radius = BorderRadius.circular(
                  CallPipWindow.radius * (1 - t),
                );
                return Positioned(
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                  child: Opacity(
                    opacity: _appear.value,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: radius,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(
                              alpha: 0.45 * (1 - t),
                            ),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: radius,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            const ColoredBox(color: AppCallColors.tileOff),
                            child!,
                            DecoratedBox(
                              decoration: BoxDecoration(
                                borderRadius: radius,
                                border: Border.all(
                                  color: Colors.white.withValues(
                                    alpha: 0.15 * (1 - t),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
              child: GestureDetector(
                key: const Key('call-pip-swap'),
                behavior: HitTestBehavior.opaque,
                onTap: widget.onTap,
                onDoubleTap: () => unawaited(_swap()),
                onPanStart: (_) {
                  if (_grow.isAnimating) return;
                  _dragging = true;
                  _x.stop();
                  _y.stop();
                },
                onPanUpdate: (d) {
                  if (!_dragging) return;
                  _x.value = (_x.value + d.delta.dx)
                      .clamp(0, _area.width - CallPipWindow.size.width);
                  _y.value = (_y.value + d.delta.dy)
                      .clamp(0, _area.height - CallPipWindow.size.height);
                },
                onPanEnd: (d) {
                  if (!_dragging) return;
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
                  // UI-10: a light tick as it settles into the corner.
                  unawaited(HapticFeedback.selectionClick());
                  _springTo(to, velocity: v);
                },
                child: picture,
              ),
            ),
          ],
        );
      },
    );
  }
}
