import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';

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
  late final AnimationController _back = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 160),
  )..addListener(() => setState(() => _dx *= 1 - _back.value));

  @override
  void dispose() {
    _back.dispose();
    super.dispose();
  }

  void _release() {
    if (_fired) widget.onReply();
    _back
      ..reset()
      ..forward();
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
                  HapticFeedback.selectionClick();
                }
              }
              ..onEnd = (_) {
                _release();
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
