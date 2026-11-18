import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

/// Row 193 (instagram.com/reels, tiktok.com): on the website the mouse
/// wheel, the trackpad and the arrow keys page through the reels one at a
/// time. A wheel notch is one reel; a trackpad swipe (with its long tail of
/// shrinking "inertia" events) is one reel too, not three; while the page
/// slides, nothing else is taken. On the phones the pager is as it was.
class ReelWebStepper {
  ReelWebStepper(this.pages);

  final PageController pages;

  /// Tests stand in for the browser.
  @visibleForTesting
  static bool debugAssumeWeb = false;

  static bool get on => kIsWeb || debugAssumeWeb;

  /// How long one step slides (the swipe's own settle feel).
  static const Duration slide = Duration(milliseconds: 300);

  final _intent = Lethargy();
  bool _sliding = false;

  /// After a wheel step the next one waits for the gesture to end: a
  /// pause, or Lethargy seeing its inertia. One trackpad swipe, one reel.
  bool _armed = true;
  Duration? _lastWheel;

  /// The pager's physics on the website: while a step slides, a wheel
  /// event does not move it by pixels (that would stop the slide half way).
  /// Null on a phone (the pager's own physics).
  ScrollPhysics? get physics => on ? _SlideGuardPhysics(this) : null;

  /// Every wheel / trackpad event over the reels ([ReelWebPager]): told
  /// intended or inertia (Lethargy), and an intended one steps a reel.
  void wheel(PointerSignalEvent event) {
    if (event is! PointerScrollEvent) return;
    final dy = event.scrollDelta.dy;
    if (dy == 0) return;
    // The page behind the player does not scroll either.
    event.respond(allowPlatformDefault: false);
    final at = event.timeStamp;
    final last = _lastWheel;
    _lastWheel = at;
    if (last == null || at - last > _intent.delay) _armed = true;
    final direction = _intent.check(dy, at);
    if (direction == 0) {
      _armed = true;
      return;
    }
    if (!_armed || _sliding) return;
    _armed = false;
    // Lethargy: 1 is up (the reel before), -1 down (the next one).
    step(-direction);
  }

  /// A wheel event over a reel page is taken from the pager, which would
  /// otherwise move by pixels and snap back or skip pages ([ReelWheelTarget];
  /// the first one to claim it wins).
  void claim(PointerSignalEvent event) {
    if (event is! PointerScrollEvent || event.scrollDelta.dy == 0) return;
    GestureBinding.instance.pointerSignalResolver.register(event, (_) {});
  }

  /// ↓ / PageDown: the next reel; ↑ / PageUp: the one before. A held key
  /// repeats, one reel per slide.
  KeyEventResult key(FocusNode _, KeyEvent event) {
    if (event is KeyUpEvent) return KeyEventResult.ignored;
    final k = event.logicalKey;
    final by =
        k == LogicalKeyboardKey.arrowDown || k == LogicalKeyboardKey.pageDown
            ? 1
            : k == LogicalKeyboardKey.arrowUp || k == LogicalKeyboardKey.pageUp
                ? -1
                : 0;
    if (by == 0) return KeyEventResult.ignored;
    step(by);
    return KeyEventResult.handled;
  }

  /// One reel down ([by] 1) or up (-1); nothing while a slide runs or past
  /// either end.
  void step(int by) {
    if (_sliding || !pages.hasClients) return;
    final p = pages.position;
    if (!p.hasContentDimensions || p.viewportDimension <= 0) return;
    final now = (p.pixels / p.viewportDimension).round();
    final to = now + by;
    if (to < 0 || p.pixels + by * p.viewportDimension > p.maxScrollExtent + 1) {
      return;
    }
    _sliding = true;
    pages
        .animateToPage(to, duration: slide, curve: Curves.easeOutCubic)
        .whenComplete(() => _sliding = false);
  }
}

/// While a step slides the pager ignores the wheel (its children ignore
/// pointers then, so no reel page can claim the event).
class _SlideGuardPhysics extends ScrollPhysics {
  const _SlideGuardPhysics(this.stepper, {super.parent});

  final ReelWebStepper stepper;

  @override
  _SlideGuardPhysics applyTo(ScrollPhysics? ancestor) =>
      _SlideGuardPhysics(stepper, parent: buildParent(ancestor));

  @override
  bool shouldAcceptUserOffset(ScrollMetrics position) =>
      !stepper._sliding && super.shouldAcceptUserOffset(position);
}

/// One reel page: a wheel event over it is not the pager's to scroll
/// ([ReelWebStepper.claim]). On a phone this is [child] alone.
class ReelWheelTarget extends StatelessWidget {
  const ReelWheelTarget({
    required this.stepper,
    required this.child,
    super.key,
  });

  final ReelWebStepper stepper;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!ReelWebStepper.on) return child;
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerSignal: stepper.claim,
      child: child,
    );
  }
}

/// The reels pager on the website: the wheel, the trackpad and the arrow
/// keys page it while it is on screen ([ReelWebStepper.wheel],
/// [ReelWebStepper.key]). On a phone this is [child] alone.
class ReelWebPager extends StatelessWidget {
  const ReelWebPager({
    required this.stepper,
    required this.child,
    super.key,
  });

  final ReelWebStepper stepper;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!ReelWebStepper.on) return child;
    return Focus(
      autofocus: true,
      onKeyEvent: stepper.key,
      child: Listener(
        behavior: HitTestBehavior.translucent,
        onPointerSignal: stepper.wheel,
        child: child,
      ),
    );
  }
}

/// Tells an intended wheel / trackpad scroll from the inertia that follows
/// it, so a swipe on a Mac trackpad is one step, not many.
///
/// A port of Lethargy by Daniel Li (MIT,
/// https://github.com/d4nyll/lethargy, lethargy.coffee at commit
/// e562bdcebb902e59e6ccf70be2eeb83c62a409c7; see THIRD_PARTY_NOTICES.md):
/// the same defaults and the same rule — an event is intended while the
/// newer half of the last deltas averages more than the older half; a
/// constant trackpad profile within [delay] is inertia. Event time comes
/// from the pointer event instead of `Date.now()`.
@visibleForTesting
class Lethargy {
  Lethargy({
    int? stability,
    double? sensitivity,
    double? tolerance,
    Duration? delay,
  })  : stability = stability == null ? 8 : stability.abs(),
        sensitivity = sensitivity == null ? 100 : 1 + sensitivity.abs(),
        tolerance = tolerance == null ? 1.1 : 1 + tolerance.abs(),
        delay = delay ?? const Duration(milliseconds: 150) {
    _up = List<double?>.filled(this.stability * 2, null, growable: true);
    _down = List<double?>.filled(this.stability * 2, null, growable: true);
    _stamps = List<Duration?>.filled(this.stability * 2, null, growable: true);
  }

  /// How many records to use to calculate the average.
  final int stability;

  /// The wheelDelta threshold: an event below it does not register.
  final double sensitivity;

  /// How much the old rolling average has to differ from the new one for
  /// it to be deemed significant.
  final double tolerance;

  /// Time between wheel events for them to be deemed separate.
  final Duration delay;

  late final List<double?> _up;
  late final List<double?> _down;
  late final List<Duration?> _stamps;

  /// [deltaY] as a DOM wheel event gives it (positive scrolls down), at
  /// [time]. 1: an intended scroll up, -1: down, 0: inertia.
  int check(double deltaY, Duration time) {
    // Standardise to wheelDelta values (deltaY * -40).
    final lastDelta = deltaY * -40;
    _stamps
      ..add(time)
      ..removeAt(0);
    if (lastDelta > 0) {
      _up
        ..add(lastDelta)
        ..removeAt(0);
      return _isInertia(1);
    }
    _down
      ..add(lastDelta)
      ..removeAt(0);
    return _isInertia(-1);
  }

  int _isInertia(int direction) {
    final lastDeltas = direction == -1 ? _down : _up;
    // Not filled up yet: no averages to compare, assume it is intended.
    if (lastDeltas[0] == null) return direction;
    // The last event came within [delay] of the one before and the values
    // are the same: a trackpad with a constant profile.
    final penultimate = _stamps[stability * 2 - 2];
    if (penultimate != null &&
        penultimate + delay > _stamps.last! &&
        lastDeltas[0] == lastDeltas[stability * 2 - 1]) {
      return 0;
    }
    final oldPart = lastDeltas.sublist(0, stability);
    final newPart = lastDeltas.sublist(stability, stability * 2);
    final oldAverage =
        oldPart.fold<double>(0, (t, s) => t + s!) / oldPart.length;
    final newAverage =
        newPart.fold<double>(0, (t, s) => t + s!) / newPart.length;
    if (oldAverage.abs() < (newAverage * tolerance).abs() &&
        sensitivity < newAverage.abs()) {
      return direction;
    }
    return 0;
  }
}
