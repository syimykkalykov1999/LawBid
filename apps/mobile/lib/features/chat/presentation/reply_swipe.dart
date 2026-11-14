import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart' show SpringSimulation;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';

/// Owner 2026-10-22 (Telegram): a message is quoted by dragging it toward
/// the START side of the screen (left in LTR) and letting go past the
/// threshold; a reply arrow appears behind it, a tap of haptics at the
/// threshold.
///
/// Why only toward the start: the screen's "back" swipe is a drag toward
/// the END side (docs/ux/GESTURES.md, rule 1). A horizontal drag detector
/// claims both directions, so the old reply swipe (to the right) swallowed
/// "back" from every bubble. This recogniser refuses a pointer that first
/// moves toward the end, so the back drag (an ancestor) takes it; a
/// drag toward the start belongs to the message. A mostly vertical move is
/// a scroll and is refused as before.
class SwipeToReply extends StatefulWidget {
  const SwipeToReply({
    required this.child,
    required this.onReply,
    super.key,
  });

  final Widget child;
  final VoidCallback onReply;

  /// How far (dp) the bubble must travel before letting go replies.
  static const double trigger = 56;

  @override
  State<SwipeToReply> createState() => _SwipeToReplyState();
}

class _SwipeToReplyState extends State<SwipeToReply>
    with SingleTickerProviderStateMixin {
  static const _max = SwipeToReply.trigger * 1.4;
  double _dx = 0; // always >= 0, toward the start
  bool _fired = false;

  // Owner rows 88/89 (2026-11-13): let go, the bubble springs back from
  // where it is with the finger's speed — Flutter's SpringSimulation
  // (physics/spring_simulation.dart, BSD-3) with AppMotion.snapBackSpring,
  // the same at 60 and 120 Hz. (It used to multiply the offset down on
  // every tick: gone in 3-4 frames, faster on a 120 Hz screen.)
  late final AnimationController _back = AnimationController.unbounded(
    vsync: this,
  )..addListener(() => setState(() => _dx = _back.value.clamp(0.0, _max)));

  @override
  void dispose() {
    _back.dispose();
    super.dispose();
  }

  /// Owner row 90 (2026-11-13): a plain tap ends as the drag recogniser's
  /// `onCancel`; with [_fired] still true from the last swipe it quoted the
  /// message again. Only a finished drag ([replied]) quotes, and the flag is
  /// cleared every time.
  void _release({bool replied = false, double velocity = 0}) {
    final fire = replied && _fired;
    _fired = false;
    if (fire) widget.onReply();
    if (_dx == 0) return;
    if (context.reduceMotion) {
      setState(() => _dx = 0);
      return;
    }
    _back.value = _dx;
    _back
        .animateWith(
      SpringSimulation(AppMotion.snapBackSpring, _dx, 0, velocity),
    )
        // The spring stops within its tolerance: land exactly home.
        .whenCompleteOrCancel(() {
      if (mounted && !_back.isAnimating) setState(() => _dx = 0);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final progress = (_dx / SwipeToReply.trigger).clamp(0.0, 1.0);
    return RawGestureDetector(
      behavior: HitTestBehavior.translucent,
      gestures: {
        TowardStartDragRecognizer:
            GestureRecognizerFactoryWithHandlers<TowardStartDragRecognizer>(
          () => TowardStartDragRecognizer(rtl: rtl),
          (r) {
            r
              ..rtl = rtl
              ..onStart = (_) {
                _back.stop();
                _fired = false;
              }
              ..onUpdate = (d) {
                final delta = rtl ? d.delta.dx : -d.delta.dx;
                // Resistance: the further, the heavier.
                final eased = delta * (1 - (_dx / _max) * 0.6);
                final next = (_dx + eased).clamp(0.0, _max);
                setState(() => _dx = next);
                if (!_fired && next >= SwipeToReply.trigger) {
                  _fired = true;
                  AppHaptics.selection();
                } else if (_fired && next < SwipeToReply.trigger) {
                  // Pulled back under the line: letting go now does not
                  // quote (Telegram, WhatsApp); crossing again taps again.
                  _fired = false;
                }
              }
              ..onEnd = (d) {
                final v = d.velocity.pixelsPerSecond.dx;
                _release(replied: true, velocity: rtl ? v : -v);
              }
              ..onCancel = _release;
          },
        ),
      },
      child: Stack(
        alignment: AlignmentDirectional.centerEnd,
        children: [
          if (_dx > 4)
            Opacity(
              opacity: progress,
              child: Transform.scale(
                scale: 0.6 + 0.4 * progress,
                child: Container(
                  key: const ValueKey('reply-swipe-arrow'),
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.surface,
                  ),
                  child: Center(
                    child: AppIcon(
                      AppIcons.replyRounded,
                      size: 18,
                      color: colors.iconTint,
                    ),
                  ),
                ),
              ),
            ),
          Transform.translate(
            offset: Offset(rtl ? _dx : -_dx, 0),
            child: widget.child,
          ),
        ],
      ),
    );
  }
}

/// A horizontal drag that accepts a pointer only when it first moves toward
/// the start side (left in LTR, right in RTL). A pointer that first moves
/// toward the end is refused at once, so an ancestor's "back" drag wins.
class TowardStartDragRecognizer extends HorizontalDragGestureRecognizer {
  TowardStartDragRecognizer({required this.rtl, super.debugOwner});

  bool rtl;
  Offset? _origin;
  bool _decided = false;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    _origin = event.position;
    _decided = false;
    super.addAllowedPointer(event);
  }

  @override
  void handleEvent(PointerEvent event) {
    if (!_decided && event is PointerMoveEvent && _origin != null) {
      final d = event.position - _origin!;
      if (d.dx.abs() > kTouchSlop / 2 && d.dx.abs() > d.dy.abs()) {
        _decided = true;
        final towardStart = rtl ? d.dx > 0 : d.dx < 0;
        if (!towardStart) {
          resolve(GestureDisposition.rejected);
          stopTrackingPointer(event.pointer);
          return;
        }
      }
    }
    super.handleEvent(event);
  }
}
