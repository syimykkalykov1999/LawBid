/// What one reel view adds up to when it ends.
typedef ReelWatchTotals = ({int watchedMs, bool completed});

/// Owner 25.11 (TikTok / YouTube watch-time logging): how long one reel view
/// really played. Fed the same truth as `PlayedViewGate` (true only while
/// frames move on screen: not paused, not buffering, not covered), it adds
/// up the playing time; [completed] marks that the clip played to its end
/// (the loop back to the start). [end] closes the view once and starts a
/// fresh one; a view that never played reports nothing.
class WatchTimeMeter {
  WatchTimeMeter({DateTime Function()? now}) : _now = now ?? DateTime.now;

  final DateTime Function() _now;

  DateTime? _since;
  int _ms = 0;
  bool _completed = false;

  /// Real playback right now (see `PlayedViewGate.playing`).
  void playing({required bool value}) {
    if (value) {
      _since ??= _now();
      return;
    }
    _take();
  }

  /// The clip reached its end and loops (only while it really plays).
  void completed() {
    if (_since != null) _completed = true;
  }

  /// Played so far in this view, ms.
  int get watchedMs {
    final s = _since;
    return _ms + (s == null ? 0 : _now().difference(s).inMilliseconds);
  }

  /// Closes this view: its totals, or null when it never played.
  ReelWatchTotals? end() {
    _take();
    final out = (watchedMs: _ms, completed: _completed);
    _ms = 0;
    _completed = false;
    return out.watchedMs > 0 ? out : null;
  }

  void _take() {
    final s = _since;
    if (s == null) return;
    _ms += _now().difference(s).inMilliseconds.clamp(0, 1 << 31);
    _since = null;
  }
}
