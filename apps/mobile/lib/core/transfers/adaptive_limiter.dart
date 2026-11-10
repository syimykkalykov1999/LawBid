import 'dart:async';
import 'dart:collection' show Queue;

/// R-251 (owner 05.11): how many pieces of a file travel at once, and how
/// that number falls on a bad network.
///
/// The Dart form of `RateLimitedQueue` of Uppy (MIT, `@uppy/utils`, tag
/// uppy@4.0.0, see THIRD_PARTY_NOTICES.md): a failed request calls
/// [rateLimit], which holds new requests for a while and drops the limit to
/// the floor; the limit then climbs halfway back to where it failed.
///
/// One difference from the source: Uppy's queue lives for one page, ours for
/// the whole app, so [restoreIfIdle] gives the next file the full limit again,
/// and the floor never goes under 1.
///
/// No Flutter import: the video cache proxy runs it in its own isolate.
///
/// Owner 2026-11-09: an optional `start` (where a new file begins, under the
/// ceiling) and `floor` (never under it after a failure), and [raise] /
/// [settle] for [ThroughputClimb].
class AdaptiveLimiter {
  AdaptiveLimiter(this._maximum, {int Function()? start, int Function()? floor})
      : _start = start,
        _floor = floor,
        limit = 1 {
    limit = startLimit;
  }

  final int Function() _maximum;
  final int Function()? _start;
  final int Function()? _floor;

  /// The most this limiter ever allows (the admin ceiling).
  int get ceiling => _atLeastOne(_maximum());

  /// Where a new file starts.
  int get startLimit {
    final s = _start?.call() ?? ceiling;
    return s.clamp(floorLimit, ceiling);
  }

  /// The lowest the limit falls after failures.
  int get floorLimit {
    final f = _atLeastOne(_floor?.call() ?? 1);
    return f > ceiling ? ceiling : f;
  }

  /// Requests allowed at once right now.
  int limit;

  int _active = 0;
  final _waiting = Queue<Completer<void>>();
  bool _paused = false;
  Timer? _pauseTimer;
  int _downLimit = 1;
  int? _upperLimit;
  Timer? _rateLimitingTimer;

  static int _atLeastOne(int v) => v < 1 ? 1 : v;

  /// Requests running now.
  int get active => _active;

  /// True while new requests are held after a failure.
  bool get isPaused => _paused;

  /// Runs [fn] when a place is free. A failure in [fn] is the caller's to
  /// report through [rateLimit]: only it knows whether it was the network.
  Future<T> run<T>(Future<T> Function() fn) async {
    if (_paused || _active >= limit) {
      final c = Completer<void>();
      _waiting.add(c);
      await c.future;
    } else {
      _active++;
    }
    try {
      return await fn();
    } finally {
      _active--;
      _next();
    }
  }

  void _next() {
    while (!_paused && _active < limit && _waiting.isNotEmpty) {
      _active++;
      _waiting.removeFirst().complete();
    }
  }

  /// A new file with nothing else on the way starts at the full limit (the
  /// admin's number may have changed, and the last file's bad minute is over).
  void restoreIfIdle() {
    if (_active > 0 || _waiting.isNotEmpty) return;
    _rateLimitingTimer?.cancel();
    _pauseTimer?.cancel();
    _paused = false;
    _upperLimit = null;
    _downLimit = floorLimit;
    limit = startLimit;
  }

  /// One more at once, when nothing is being waited out and the ceiling is
  /// not reached. True when the limit grew.
  bool raise() {
    if (_paused || (_rateLimitingTimer?.isActive ?? false)) return false;
    if (limit >= ceiling) return false;
    limit++;
    _next();
    return true;
  }

  /// One fewer at once (the last [raise] gave no speed), not under the floor.
  void settle() {
    if (limit > floorLimit) limit--;
  }

  void _resume() {
    _paused = false;
    _pauseTimer?.cancel();
    _next();
  }

  /// Holds new requests for [duration], then goes on at a lower limit that
  /// climbs back step by step until the next call.
  void rateLimit(Duration duration) {
    _rateLimitingTimer?.cancel();
    _paused = true;
    _pauseTimer?.cancel();
    _pauseTimer = Timer(duration, _resume);
    if (limit > floorLimit) {
      _upperLimit = limit - 1;
      limit = _downLimit < floorLimit ? floorLimit : _downLimit;
      _rateLimitingTimer = Timer(duration, _increaseLimit);
    }
  }

  void _increaseLimit() {
    if (_paused) {
      _rateLimitingTimer = Timer(Duration.zero, _increaseLimit);
      return;
    }
    _downLimit = limit;
    final upper = _upperLimit ?? limit;
    limit = ((upper + _downLimit) / 2).ceil();
    _next();
    if (upper - _downLimit > 3) {
      _rateLimitingTimer = Timer(const Duration(seconds: 2), _increaseLimit);
    } else {
      final half = _downLimit ~/ 2;
      _downLimit = half < floorLimit ? floorLimit : half;
    }
  }
}

/// Owner 2026-11-09 («почему только 4 куска»): the parts of one upload climb
/// while the total speed keeps growing, like the hill climb of TCP slow start
/// and the auto-tuned part concurrency of the big resumable uploaders. Each
/// round is [AdaptiveLimiter.limit] finished parts; a round at least [gain]
/// faster than the last one adds one more part at once ([AdaptiveLimiter.
/// raise], never past the ceiling); a round that is not faster takes that
/// part back ([AdaptiveLimiter.settle]) and the climb stops for this file.
/// Failures are the limiter's own business ([AdaptiveLimiter.rateLimit]
/// drops to the floor).
class ThroughputClimb {
  ThroughputClimb(this._limiter, {DateTime Function()? now, this.gain = 1.1})
      : _now = now ?? DateTime.now;

  final AdaptiveLimiter _limiter;
  final DateTime Function() _now;

  /// How much faster a round must be to keep climbing.
  final double gain;

  DateTime? _since;
  int _bytes = 0;
  int _parts = 0;
  double? _best;
  bool _done = false;

  /// A part starts (the first one starts the clock).
  void started() => _since ??= _now();

  /// A part of [bytes] arrived.
  void finished(int bytes) {
    final since = _since;
    if (_done || since == null) return;
    _bytes += bytes;
    _parts++;
    if (_parts < _limiter.limit) return;
    final now = _now();
    final seconds = now.difference(since).inMicroseconds / 1e6;
    if (seconds <= 0) return;
    final rate = _bytes / seconds;
    final best = _best;
    if (best == null || rate >= best * gain) {
      _best = rate;
      if (!_limiter.raise()) _done = _limiter.limit >= _limiter.ceiling;
    } else {
      _limiter.settle();
      _done = true;
    }
    _since = now;
    _bytes = 0;
    _parts = 0;
  }
}

/// Runs [work] over [items], at most [atOnce] at a time, and returns the
/// results in the order of [items] (the worker loop of `__doConcurrentUpload`
/// in @aws-sdk/lib-storage, Apache-2.0). The first failure stops new work and
/// is what the caller sees; [atOnce] of 1 is a plain loop.
Future<List<R>> mapAtOnce<T, R>(
  List<T> items,
  int atOnce,
  Future<R> Function(T item) work,
) async {
  final results = List<R?>.filled(items.length, null);
  var next = 0;
  var failed = false;
  Future<void> worker() async {
    while (!failed && next < items.length) {
      final i = next++;
      try {
        results[i] = await work(items[i]);
      } on Object {
        failed = true;
        rethrow;
      }
    }
  }

  final count = atOnce < 1 ? 1 : atOnce;
  await Future.wait([
    for (var i = 0; i < count && i < items.length; i++) worker(),
  ]);
  return results.cast<R>();
}

/// R-251: several files of one send. With [atOnce] above 1 they all go up
/// first, together, and the messages then leave in the order of [items] (a
/// failed file sends nothing, so a retry never doubles a message). With 1,
/// file by file and message by message, as before the flag. [alive] false
/// stops before the next message (the screen was closed).
Future<void> uploadThenSendInOrder<T, I extends Object>({
  required List<T> items,
  required int atOnce,
  required Future<I> Function(T item) upload,
  required Future<void> Function(int index, T item, I uploaded) send,
  bool Function()? alive,
}) async {
  final ready = atOnce > 1 && items.length > 1
      ? await mapAtOnce(items, atOnce, upload)
      : null;
  for (var i = 0; i < items.length; i++) {
    if (!(alive?.call() ?? true)) return;
    final uploaded = ready?[i] ?? await upload(items[i]);
    if (!(alive?.call() ?? true)) return;
    await send(i, items[i], uploaded);
  }
}
