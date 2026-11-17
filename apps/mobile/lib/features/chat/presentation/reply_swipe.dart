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
/// a scroll and is refused at once.
///
/// Owner row 89 (2026-11-16, «как у WhatsApp/Telegram»):
/// - the line is 64 dp of finger travel (it was 56 dp of a resisted bubble,
///   about 100 dp of finger with the lost touch slop): the bubble follows
///   the finger 1:1 to the line, then a rubber band;
/// - one LIGHT impact when the line is crossed (both apps use an impact,
///   not the softer selection tick), again only after going back under it;
/// - the drag only writes an [AnimationController]'s value and the bubble
///   moves through an [AnimatedBuilder]: the pattern of Flutter's own
///   `Dismissible` (widgets/dismissible.dart, BSD-3, a `_moveController`
///   written by the drag and painted by a transition). A drag frame
///   rebuilds only the arrow; the bubble is a cached layer
///   ([RepaintBoundary]) that only moves, so 120 Hz stays smooth.
/// The `swipe_to` package (MIT, 1.0.6) was checked and not taken: it fires
/// on one fast pan delta (the bubble does not follow the finger), its pan
/// detector also claims vertical drags (steals the list scroll), and it
/// rebuilds on every animation tick.
class SwipeToReply extends StatefulWidget {
  const SwipeToReply({
    required this.child,
    required this.onReply,
    super.key,
  });

  final Widget child;
  final VoidCallback onReply;

  /// How far (dp) the bubble must travel before letting go replies.
  static const double trigger = 64;

  /// The farthest the bubble goes (with growing resistance).
  static const double maxTravel = trigger * 1.4;

  @override
  State<SwipeToReply> createState() => _SwipeToReplyState();
}

class _SwipeToReplyState extends State<SwipeToReply>
    with SingleTickerProviderStateMixin {
  static const _max = SwipeToReply.maxTravel;
  bool _fired = false;

  // The one source of the offset (dp toward the start, 0.._max): the drag
  // writes it, the spring animates it (Dismissible's `_moveController`).
  //
  // Owner rows 88/89 (2026-11-13): let go, the bubble springs back from
  // where it is with the finger's speed: Flutter's SpringSimulation
  // (physics/spring_simulation.dart, BSD-3) with AppMotion.snapBackSpring,
  // the same at 60 and 120 Hz.
  late final AnimationController _dx = AnimationController(
    vsync: this,
    upperBound: _max,
  );

  @override
  void dispose() {
    _dx.dispose();
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
    if (_dx.value == 0) return;
    if (context.reduceMotion) {
      _dx.value = 0;
      return;
    }
    _dx
        .animateWith(
      SpringSimulation(AppMotion.snapBackSpring, _dx.value, 0, velocity),
    )
        // The spring stops within its tolerance: land exactly home.
        .whenCompleteOrCancel(() {
      if (mounted && !_dx.isAnimating) _dx.value = 0;
    });
  }

  void _update(DragUpdateDetails d, bool rtl) {
    final delta = rtl ? d.delta.dx : -d.delta.dx;
    final dx = _dx.value;
    // Telegram/WhatsApp: the bubble stays under the finger up to the line,
    // past it a rubber band that gets heavier toward [_max]; going back is
    // never heavy.
    const trigger = SwipeToReply.trigger;
    final eased = delta <= 0 || dx < trigger
        ? delta
        : delta * 0.5 * (1 - (dx - trigger) / (_max - trigger));
    final next = (dx + eased).clamp(0.0, _max);
    _dx.value = next;
    if (!_fired && next >= SwipeToReply.trigger) {
      _fired = true;
      AppHaptics.light();
    } else if (_fired && next < SwipeToReply.trigger) {
      // Pulled back under the line: letting go now does not quote
      // (Telegram, WhatsApp); crossing again taps again.
      _fired = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return RawGestureDetector(
      behavior: HitTestBehavior.translucent,
      gestures: {
        TowardStartDragRecognizer:
            GestureRecognizerFactoryWithHandlers<TowardStartDragRecognizer>(
          () => TowardStartDragRecognizer(rtl: rtl),
          (r) {
            r
              ..rtl = rtl
              // Count from the touch-down, as iOS pan recognisers do, so
              // 64 dp of finger is 64 dp of bubble (the slop is not lost).
              ..dragStartBehavior = DragStartBehavior.down
              ..onStart = (_) {
                _dx.stop();
                _fired = false;
              }
              ..onUpdate = (d) {
                _update(d, rtl);
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
          AnimatedBuilder(
            animation: _dx,
            builder: (context, _) {
              final dx = _dx.value;
              if (dx <= 4) return const SizedBox.shrink();
              final progress = (dx / SwipeToReply.trigger).clamp(0.0, 1.0);
              return Opacity(
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
              );
            },
          ),
          AnimatedBuilder(
            animation: _dx,
            builder: (context, child) => Transform.translate(
              offset: Offset(rtl ? _dx.value : -_dx.value, 0),
              child: child,
            ),
            child: RepaintBoundary(child: widget.child),
          ),
        ],
      ),
    );
  }
}

/// A horizontal drag that accepts a pointer only when it first moves toward
/// the start side (left in LTR, right in RTL). A pointer that first moves
/// toward the end is refused at once, so an ancestor's "back" drag wins; a
/// pointer that first moves mostly up or down is refused too, so the list
/// scrolls (owner row 89: the reply swipe never takes the scroll).
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
      if (d.distance > kTouchSlop / 2) {
        _decided = true;
        final towardStart = rtl ? d.dx > 0 : d.dx < 0;
        if (d.dy.abs() > d.dx.abs() || !towardStart) {
          resolve(GestureDisposition.rejected);
          stopTrackingPointer(event.pointer);
          return;
        }
      }
    }
    super.handleEvent(event);
  }
}
