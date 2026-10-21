import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// Owner 2026-10-21 (Telegram / WhatsApp): the small picture of a 1:1 video
/// call. A tap swaps it with the big one, a drag moves it and it settles in
/// the nearest corner, the cross puts it away (a tap on the screen brings
/// it back). Where it rests is kept in [callVideoLayoutProvider].
class CallPipWindow extends ConsumerStatefulWidget {
  const CallPipWindow({
    required this.stream,
    required this.mirror,
    required this.onTap,
    this.topInset = 0,
    this.bottomInset = 0,
    super.key,
  });

  static const size = Size(104, 156);

  final MediaStream stream;
  final bool mirror;
  final VoidCallback onTap;

  /// Room kept free for the buttons above / below it.
  final double topInset;
  final double bottomInset;

  @override
  ConsumerState<CallPipWindow> createState() => _CallPipWindowState();
}

class _CallPipWindowState extends ConsumerState<CallPipWindow> {
  /// Top-left while a finger drags it (null = resting in its corner).
  Offset? _drag;

  Offset _rest(PipCorner corner, Size area, bool rtl) {
    const m = AppSpacing.md;
    const size = CallPipWindow.size;
    final right = switch (corner) {
      PipCorner.topEnd || PipCorner.bottomEnd => !rtl,
      PipCorner.topStart || PipCorner.bottomStart => rtl,
    };
    final top = corner == PipCorner.topEnd || corner == PipCorner.topStart;
    return Offset(
      right ? area.width - size.width - m : m,
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

  @override
  Widget build(BuildContext context) {
    final layout = ref.watch(callVideoLayoutProvider);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return LayoutBuilder(
      builder: (context, box) {
        final area = box.biggest;
        final at = _drag ?? _rest(layout.corner, area, rtl);
        const size = CallPipWindow.size;
        return Stack(
          children: [
            AnimatedPositioned(
              duration: _drag != null || context.reduceMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              left: at.dx,
              top: at.dy,
              width: size.width,
              height: size.height,
              child: GestureDetector(
                key: const Key('call-pip-swap'),
                behavior: HitTestBehavior.opaque,
                onTap: widget.onTap,
                onPanUpdate: (d) => setState(() {
                  final cur = _drag ?? at;
                  _drag = Offset(
                    (cur.dx + d.delta.dx).clamp(0, area.width - size.width),
                    (cur.dy + d.delta.dy).clamp(0, area.height - size.height),
                  );
                }),
                onPanEnd: (_) {
                  final drop = _drag;
                  if (drop == null) return;
                  ref.read(callVideoLayoutProvider.notifier).moveTo(
                        _nearest(drop + size.center(Offset.zero), area, rtl),
                      );
                  setState(() => _drag = null);
                },
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadii.card),
                      child: CallVideoView(
                        stream: widget.stream,
                        mirror: widget.mirror,
                      ),
                    ),
                    PositionedDirectional(
                      top: 2,
                      end: 2,
                      child: GestureDetector(
                        key: const Key('call-pip-hide'),
                        behavior: HitTestBehavior.opaque,
                        onTap:
                            ref.read(callVideoLayoutProvider.notifier).hidePip,
                        child: Padding(
                          padding: const EdgeInsets.all(6),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.black.withValues(alpha: 0.45),
                            ),
                            child: const Padding(
                              padding: EdgeInsets.all(3),
                              child: AppIcon(
                                AppIcons.closeRounded,
                                size: 14,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
