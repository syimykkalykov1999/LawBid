import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-10-22 (checklist §17, WCAG 2.3.3): the phone's «Reduce
/// motion» (iOS) / «Remove animations» (Android) setting, honoured in ONE
/// place and pushed everywhere from here:
///
/// - `LawBidApp` wraps the whole tree in a `MediaQuery` with
///   `disableAnimations: true`, so every design-system widget that already
///   checks `context.reduceMotion` (entrances, the gavel strike, the logo,
///   the feed chrome, banners…) renders its final state at once;
/// - `AppTheme` is built with a no-motion `pageTransitionsTheme`, so plain
///   `MaterialPageRoute`s swap instantly;
/// - `AppPageTransitions` (go_router pages) read [ReduceMotion.enabled]
///   and return zero-length transitions.
///
/// The state follows the OS live (`onAccessibilityFeaturesChanged`); tests
/// and a future in-app switch call [ReduceMotionController.set].
class ReduceMotionController extends Notifier<bool> {
  VoidCallback? _previous;

  @override
  bool build() {
    final dispatcher = WidgetsBinding.instance.platformDispatcher;
    _previous = dispatcher.onAccessibilityFeaturesChanged;
    dispatcher.onAccessibilityFeaturesChanged = () {
      _previous?.call();
      _apply(dispatcher.accessibilityFeatures.disableAnimations);
    };
    ref.onDispose(() {
      if (dispatcher.onAccessibilityFeaturesChanged != null) {
        dispatcher.onAccessibilityFeaturesChanged = _previous;
      }
    });
    final initial = dispatcher.accessibilityFeatures.disableAnimations;
    ReduceMotion.enabled.value = initial;
    return initial;
  }

  void _apply(bool value) {
    if (state == value) return;
    state = value;
    ReduceMotion.enabled.value = value;
  }

  /// Forces the value (tests; an in-app «less motion» switch later).
  // ignore: avoid_positional_boolean_parameters, use_setters_to_change_properties
  void set(bool value) => _apply(value);
}

final reduceMotionProvider = NotifierProvider<ReduceMotionController, bool>(
  ReduceMotionController.new,
);

/// The same value for code without a `Ref` or a `BuildContext` under the
/// app's `MediaQuery` (go_router page builders). Mirrors
/// [reduceMotionProvider]; never written anywhere else.
abstract final class ReduceMotion {
  static final ValueNotifier<bool> enabled = ValueNotifier(false);

  /// [duration], or nothing at all under reduce motion.
  static Duration of(Duration duration) =>
      enabled.value ? Duration.zero : duration;
}

/// Puts `MediaQuery.disableAnimations` on for the subtree while the
/// provider says so (the phone's own flag stays honoured when it is off).
class ReduceMotionScope extends ConsumerWidget {
  const ReduceMotionScope({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reduce = ref.watch(reduceMotionProvider);
    if (!reduce) return child;
    final media = MediaQuery.maybeOf(context);
    if (media == null || media.disableAnimations) return child;
    return MediaQuery(
      data: media.copyWith(disableAnimations: true),
      child: child,
    );
  }
}
