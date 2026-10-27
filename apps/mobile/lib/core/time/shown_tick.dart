import 'package:flutter/widgets.dart';

/// 2026-10-26 (smoothness P7): a once-a-second (or once-every-N) clock
/// rebuild that waits while its screen is hidden.
///
/// The bottom tabs are kept alive in an `IndexedStack`; a hidden tab sits
/// under `TickerMode(enabled: false)`. Riverpod already pauses a hidden
/// widget's `ref.watch` (flutter_riverpod 3: Consumer pauses on TickerMode),
/// and animations stop, but a plain `Timer.periodic` + `setState` keeps
/// rebuilding a screen nobody sees. With this mixin the tick only rebuilds
/// while the widget is shown; the moment it is shown again it rebuilds once
/// (its `TickerMode` dependency changes) with the current time.
///
/// Use: call [trackShown] in `build` (it returns true when ticks were
/// skipped while hidden, for a widget that keeps its own `now`), and
/// [shownTick] from the timer instead of `setState`.
mixin ShownTick<T extends StatefulWidget> on State<T> {
  bool _shown = true;
  bool _missed = false;

  /// Whether the widget is on a shown screen (as of its last build).
  bool get isShown => _shown;

  /// Reads the [TickerMode] (and depends on it). Returns true once after
  /// the widget comes back from hidden with ticks skipped.
  bool trackShown(BuildContext context) {
    _shown = TickerMode.valuesOf(context).enabled;
    if (!_shown || !_missed) return false;
    _missed = false;
    return true;
  }

  /// The timer's rebuild: `setState(fn)` when shown, otherwise remembered.
  void shownTick([VoidCallback? fn]) {
    if (!mounted) return;
    if (_shown) {
      setState(fn ?? () {});
    } else {
      _missed = true;
    }
  }
}
