import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Owner row 95 (2026-11-13, docs/dev/MOTION_CATALOG_2026-11-13.md): the
/// small motions the catalog asks for in many places, built once here.
/// Every one honours reduce motion (it shows the final state at once).

/// The pop of [AppPopIn] / [AppMotionBits.pop]: scale 0.6 → 1 on
/// `easeOutBack` with a fade (catalog F6 / M6 / C7; the iOS tapback badge
/// and Telegram's reaction chip). Flutter `ScaleTransition` (BSD-3).
abstract final class AppMotionBits {
  /// An `AnimatedSwitcher.transitionBuilder` that pops the new child in.
  static Widget pop(Widget child, Animation<double> animation) {
    final curved = CurvedAnimation(
      parent: animation,
      curve: AppMotion.popCurve,
      reverseCurve: Curves.easeIn,
    );
    return FadeTransition(
      opacity: animation,
      child: ScaleTransition(
        scale: Tween<double>(begin: AppMotion.popScaleFrom, end: 1)
            .animate(curved),
        child: child,
      ),
    );
  }
}

/// Pops its child in once, on its first build, when [animate] is true
/// (a reaction chip that just landed, a badge that just appeared). A
/// child that was already there when the list was built stays still.
class AppPopIn extends StatefulWidget {
  const AppPopIn({
    required this.child,
    this.animate = true,
    this.alignment = Alignment.center,
    super.key,
  });

  final Widget child;
  final bool animate;
  final Alignment alignment;

  @override
  State<AppPopIn> createState() => _AppPopInState();
}

class _AppPopInState extends State<AppPopIn>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;
  bool _decided = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_decided) return;
    _decided = true;
    if (!widget.animate || context.reduceMotion) return;
    _controller = AnimationController(vsync: this, duration: AppMotion.popIn)
      ..forward();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    if (c == null) return widget.child;
    return FadeTransition(
      opacity: c,
      child: ScaleTransition(
        alignment: widget.alignment,
        scale: Tween<double>(begin: AppMotion.popScaleFrom, end: 1).animate(
          CurvedAnimation(parent: c, curve: AppMotion.popCurve),
        ),
        child: widget.child,
      ),
    );
  }
}

/// Starts an [AppShake]: `controller.shake()` after a wrong code or an
/// invalid form.
class AppShakeController extends ChangeNotifier {
  /// Shakes the field and buzzes the error haptic.
  void shake() => notifyListeners();
}

/// Catalog F3 / O4 / K6 (the iOS passcode field, Telegram's code field):
/// on [AppShakeController.shake] the child swings left and right
/// ([AppMotion.shakeSwings] times, ±[AppMotion.shakeOffset] px in
/// [AppMotion.shake]) and the phone gives the error haptic. The swing is
/// `flutter_animate`'s `ShakeEffect` formula (BSD-3, already in pubspec).
/// Reduce motion: only the haptic.
class AppShake extends StatefulWidget {
  const AppShake({required this.controller, required this.child, super.key});

  final AppShakeController controller;
  final Widget child;

  @override
  State<AppShake> createState() => _AppShakeState();
}

class _AppShakeState extends State<AppShake>
    with SingleTickerProviderStateMixin {
  late final AnimationController _motion =
      AnimationController(vsync: this, duration: AppMotion.shake);

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_go);
  }

  @override
  void didUpdateWidget(AppShake old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_go);
      widget.controller.addListener(_go);
    }
  }

  void _go() {
    unawaited(AppHaptics.error());
    if (!mounted || context.reduceMotion) return;
    unawaited(_motion.forward(from: 0));
  }

  @override
  void dispose() {
    widget.controller.removeListener(_go);
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _motion,
        // flutter_animate's `ShakeEffect.build` (BSD-3) as is: the offset is
        // sin(t · count · 2π) times the amplitude. Copied rather than used
        // through `Animate`, whose start-up timer outlives a widget test.
        builder: (context, child) => _motion.isAnimating
            ? Transform.translate(
                offset: Offset(
                  AppMotion.shakeOffset *
                      math.sin(
                        _motion.value * AppMotion.shakeSwings * math.pi * 2,
                      ),
                  0,
                ),
                child: child,
              )
            : child!,
        child: widget.child,
      );
}

/// Catalog C6 (iOS 17 `contentTransition(.numericText())`, Telegram's
/// counters): a count whose changed characters roll — up when it grows,
/// down when it shrinks — in [AppMotion.counterRoll]; the characters
/// that did not change stay still. Flutter `AnimatedSwitcher` +
/// `SlideTransition` (BSD-3).
class AppCounterRoll extends StatefulWidget {
  const AppCounterRoll({
    required this.text,
    required this.value,
    this.style,
    super.key,
  });

  /// What is shown (it may be formatted: «1.2K»).
  final String text;

  /// The number behind [text]: tells up from down.
  final int value;
  final TextStyle? style;

  @override
  State<AppCounterRoll> createState() => _AppCounterRollState();
}

class _AppCounterRollState extends State<AppCounterRoll>
    with SingleTickerProviderStateMixin {
  late final AnimationController _roll = AnimationController(
    vsync: this,
    duration: AppMotion.counterRoll,
  )..addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) {
        setState(() => _from = null);
      }
    });

  late final Animation<double> _curved =
      CurvedAnimation(parent: _roll, curve: Curves.easeOutCubic);

  /// The text rolling away; null when nothing moves (a plain `Text`).
  String? _from;
  bool _up = true;

  @override
  void didUpdateWidget(AppCounterRoll old) {
    super.didUpdateWidget(old);
    if (old.text == widget.text || context.reduceMotion) return;
    _from = old.text;
    _up = widget.value >= old.value;
    unawaited(_roll.forward(from: 0));
  }

  @override
  void dispose() {
    _roll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final style = widget.style;
    final from = _from;
    if (from == null) return Text(widget.text, maxLines: 1, style: style);
    final now = widget.text.characters.toList();
    final was = from.characters.toList();
    final curved = _curved;
    final dir = _up ? 1.0 : -1.0;
    Widget char(int fromEnd) {
      final n = fromEnd <= now.length ? now[now.length - fromEnd] : null;
      final o = fromEnd <= was.length ? was[was.length - fromEnd] : null;
      if (n == o) return Text(n ?? '', style: style);
      // The old digit leaves one way while the new one comes in from the
      // other (up for a bigger number).
      return ClipRect(
        child: AnimatedBuilder(
          animation: curved,
          builder: (context, _) => Stack(
            alignment: Alignment.center,
            children: [
              if (o != null)
                FractionalTranslation(
                  translation: Offset(0, -dir * curved.value),
                  child: Opacity(
                    opacity: 1 - curved.value,
                    child: Text(o, style: style),
                  ),
                ),
              FractionalTranslation(
                translation: Offset(0, dir * (1 - curved.value)),
                child: Opacity(
                  opacity: curved.value,
                  child: Text(n ?? '', style: style),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final width = now.length > was.length ? now.length : was.length;
    return Semantics(
      label: widget.text,
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [for (var e = width; e >= 1; e--) char(e)],
      ),
    );
  }
}

/// Catalog C4 (`AnimatedList` insert, 300 ms, `SizeTransition` + fade,
/// Flutter BSD-3): a row that just came into a list (a comment just
/// posted, a task just made) grows in on its first build instead of
/// appearing at once. Rows that were already there never move — see
/// [AppInsertMotion.fresh] — and neither do the rows of a list that is
/// being shown for the first time.
class AppInsertMotion extends StatefulWidget {
  const AppInsertMotion({
    required this.animate,
    required this.child,
    super.key,
  });

  /// Made within the last few seconds (the device's clock against the
  /// item's own time; a clock that is far off just means no motion).
  static bool fresh(DateTime createdAt, {DateTime? now}) =>
      (now ?? DateTime.now()).difference(createdAt).abs() < freshFor;

  static const Duration freshFor = Duration(seconds: 3);

  final bool animate;
  final Widget child;

  @override
  State<AppInsertMotion> createState() => _AppInsertMotionState();
}

class _AppInsertMotionState extends State<AppInsertMotion>
    with SingleTickerProviderStateMixin {
  AnimationController? _c;
  Animation<double>? _curved;
  bool _decided = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_decided) return;
    _decided = true;
    if (!widget.animate || context.reduceMotion) return;
    // A row of a list that is only now being laid out for the first time
    // (the screen opening) is not an insert: it never grows.
    final list = Scrollable.maybeOf(context)?.position;
    if (list == null || !list.hasContentDimensions) return;
    final c = AnimationController(vsync: this, duration: AppMotion.listChange);
    _c = c;
    _curved = CurvedAnimation(parent: c, curve: Curves.easeInOut);
    unawaited(c.forward());
  }

  @override
  void dispose() {
    _c?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    final curved = _curved;
    if (c == null || curved == null) return widget.child;
    return SizeTransition(
      sizeFactor: curved,
      alignment: Alignment.topCenter,
      child: FadeTransition(opacity: c, child: widget.child),
    );
  }
}

/// Catalog T1 / CA2 (the iOS banner, WhatsApp's in-app call banner): a
/// banner at the top of the screen that slides down over the content
/// (never pushing it) on the Material 3 emphasized curves, and slides back
/// up when [child] becomes null. Put it in a `Positioned` at the top of a
/// `Stack`. Reduce motion: it appears and goes at once.
class AppTopBannerSwitcher extends StatelessWidget {
  const AppTopBannerSwitcher({this.child, super.key});

  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final still = context.reduceMotion;
    return AnimatedSwitcher(
      duration: still ? Duration.zero : AppMotion.topBannerEnter,
      reverseDuration: still ? Duration.zero : AppMotion.topBannerExit,
      switchInCurve: AppMotion.topBannerEnterCurve,
      switchOutCurve: AppMotion.topBannerExitCurve,
      layoutBuilder: (current, previous) => Stack(
        alignment: Alignment.topCenter,
        children: [...previous, if (current != null) current],
      ),
      transitionBuilder: (child, animation) => SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, -1), end: Offset.zero)
            .animate(animation),
        child: child,
      ),
      child: child ?? const SizedBox.shrink(key: ValueKey('no-banner')),
    );
  }
}
