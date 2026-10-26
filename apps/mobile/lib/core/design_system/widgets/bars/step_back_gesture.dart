import 'package:flutter/material.dart';

/// Owner 2026-10-15: "Back" in a step-by-step flow (onboarding) always goes
/// ONE step back, however it is asked for:
/// - the back button (the screen's own),
/// - the system back (Android button / gesture),
/// - the iPhone-style swipe from the left edge (the right edge in RTL).
///
/// Onboarding screens replace each other (`go`), so there is no route
/// underneath for the system to swipe back to; that is why the swipe used to
/// work only now and then. This takes the pop and the swipe itself and calls
/// [onBack], so all three do the same thing, every time.
class StepBackGesture extends StatelessWidget {
  const StepBackGesture({
    required this.onBack,
    required this.child,
    super.key,
    this.enabled = true,
  });

  /// Where "back" goes; null or [enabled] false leaves the screen alone.
  final VoidCallback? onBack;
  final bool enabled;
  final Widget child;

  /// Width of the strip along the edge that starts the swipe.
  static const double edgeWidth = 28;

  /// How far (or how fast) the finger must travel to count as a swipe.
  static const double minDistance = 56;
  static const double minVelocity = 300;

  @override
  Widget build(BuildContext context) {
    final back = onBack;
    if (!enabled || back == null) return child;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) back();
      },
      child: Stack(
        children: [
          Positioned.fill(child: child),
          PositionedDirectional(
            start: 0,
            top: 0,
            bottom: 0,
            width: edgeWidth,
            child: _EdgeStrip(onBack: back),
          ),
        ],
      ),
    );
  }
}

class _EdgeStrip extends StatefulWidget {
  const _EdgeStrip({required this.onBack});

  final VoidCallback onBack;

  @override
  State<_EdgeStrip> createState() => _EdgeStripState();
}

class _EdgeStripState extends State<_EdgeStrip> {
  double _travel = 0;

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    // Towards the inside of the screen: right in LTR, left in RTL.
    final sign = rtl ? -1.0 : 1.0;
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragStart: (_) => _travel = 0,
      onHorizontalDragUpdate: (d) => _travel += d.delta.dx * sign,
      onHorizontalDragEnd: (d) {
        final speed = (d.primaryVelocity ?? 0) * sign;
        if (_travel >= StepBackGesture.minDistance ||
            speed >= StepBackGesture.minVelocity) {
          widget.onBack();
        }
        _travel = 0;
      },
      onHorizontalDragCancel: () => _travel = 0,
    );
  }
}
