import 'dart:async';
import 'dart:ui' show VoidCallback;

/// Owner 2026-10-20 (Instagram / TikTok "video view"): a view is counted only
/// when the video really plays on screen for [after] without a break. Any
/// stop (pause, buffering, scrolled away, covered) cancels the wait; a new
/// run of playing starts it over. After it fires once it stays quiet.
class PlayedViewGate {
  PlayedViewGate(this.onViewed, {this.after = const Duration(seconds: 3)});

  final VoidCallback onViewed;
  final Duration after;

  Timer? _timer;
  bool _fired = false;

  /// Feed it the truth about playback: true while frames really move.
  void playing({required bool value}) {
    if (_fired) return;
    if (!value) {
      _timer?.cancel();
      _timer = null;
      return;
    }
    _timer ??= Timer(after, () {
      _timer = null;
      _fired = true;
      onViewed();
    });
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
  }
}
