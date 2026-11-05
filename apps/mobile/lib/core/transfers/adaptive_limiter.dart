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
class AdaptiveLimiter {
  AdaptiveLimiter(this._maximum) : limit = _atLeastOne(_maximum());

  final int Function() _maximum;

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
    _downLimit = 1;
    limit = _atLeastOne(_maximum());
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
    if (limit > 1) {
      _upperLimit = limit - 1;
      limit = _atLeastOne(_downLimit);
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
      _downLimit = _atLeastOne(_downLimit ~/ 2);
    }
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
