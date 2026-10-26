import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:lawbid/core/realtime/realtime_timings.dart';
import 'package:lawbid/core/realtime/reconnect_controller.dart';

/// The `exp` claim of [accessToken], or null when it is not a readable JWT.
DateTime? jwtExpiry(String accessToken) {
  final parts = accessToken.split('.');
  if (parts.length != 3) return null;
  try {
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    final exp = payload is Map ? payload['exp'] : null;
    if (exp is! num) return null;
    return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000, isUtc: true);
  } on FormatException {
    return null;
  }
}

/// Owner 2026-10-23 (part C1): the access token lives 15 minutes and the
/// server closes the socket when it expires. The phone used to renew it only
/// after a 401, i.e. after the break. This renews it ahead of time:
///
/// - [schedule]: one timer for `exp - lead` (the server's
///   `tokenRefreshLeadSec`, 120 s by default);
/// - [ensureFresh]: on app resume / network change, renew at once when less
///   than [resumeThreshold] is left;
/// - [refreshNow]: the server said `auth:expiring`.
///
/// `refresh` must be single-flight (the session's `RefreshCoordinator` is),
/// so this never runs a second parallel `/auth/refresh`.
class ProactiveTokenRefresher {
  ProactiveTokenRefresher({
    required Future<void> Function() refresh,
    required RealtimeTimings Function() timings,
    DateTime Function()? now,
    TimerFactory? timer,
    this.resumeThreshold = const Duration(minutes: 5),
    this.retryAfter = const Duration(seconds: 15),
    this.minWait = const Duration(seconds: 30),
    this.maxJitter = const Duration(seconds: 5),
    this.maxRunsPerMinute = 3,
    Random? random,
  })  : _random = random ?? Random(),
        _refresh = refresh,
        _timings = timings,
        _now = now ?? DateTime.now,
        _timer = timer ?? Timer.new;

  final Future<void> Function() _refresh;
  final RealtimeTimings Function() _timings;
  final DateTime Function() _now;
  final TimerFactory _timer;
  final Duration resumeThreshold;
  final Duration retryAfter;

  /// S15-3: the timer never fires sooner than this (a clock that disagrees
  /// with the token used to give a refresh every second), plus up to
  /// [maxJitter], so the many phones that land on the floor together (a
  /// server-wide clock event) do not renew in lockstep.
  final Duration minWait;
  final Duration maxJitter;

  /// S15-3: at most this many renewals in any 60 seconds, whatever asks
  /// (timer, resume, `auth:expiring`, retry).
  final int maxRunsPerMinute;
  final Random _random;
  final List<DateTime> _runs = [];

  Timer? _pending;
  DateTime? _expiresAt;
  bool _disposed = false;
  bool _paused = false;

  DateTime? get expiresAt => _expiresAt;
  bool get hasTimer => _pending?.isActive ?? false;

  /// A new access token arrived (sign-in, refresh): plan the next renewal.
  void schedule(DateTime expiresAt) {
    _expiresAt = expiresAt;
    _arm();
  }

  /// Signed out: nothing to renew.
  void clear() {
    _expiresAt = null;
    _pending?.cancel();
    _pending = null;
  }

  /// Background: no timers (a resume checks the token instead).
  void pause() {
    _paused = true;
    _pending?.cancel();
    _pending = null;
  }

  /// Foreground / network back: renew now when the token is about to end.
  Future<void> ensureFresh() async {
    _paused = false;
    final exp = _expiresAt;
    if (exp == null || _disposed) return;
    if (exp.difference(_now()) < resumeThreshold) {
      await _run();
    } else {
      _arm();
    }
  }

  /// The server announced the end of the token (`auth:expiring`).
  Future<void> refreshNow() => _run();

  void dispose() {
    _disposed = true;
    clear();
  }

  void _arm() {
    _pending?.cancel();
    _pending = null;
    final exp = _expiresAt;
    if (exp == null || _disposed || _paused) return;
    final lead = Duration(seconds: _timings().tokenRefreshLeadSec);
    var wait = exp.difference(_now()) - lead;
    // A token that is already inside the lead window is renewed after a
    // floor of [minWait] (+ jitter), never in a tight loop.
    if (wait < minWait) {
      wait = minWait +
          Duration(
            milliseconds:
                (maxJitter.inMilliseconds * _random.nextDouble()).round(),
          );
    }
    _pending = _timer(wait, () {
      _pending = null;
      unawaited(_run());
    });
  }

  /// Records a run; false when [maxRunsPerMinute] was already reached in the
  /// last minute.
  bool _allowRun() {
    final now = _now();
    _runs.removeWhere((t) => now.difference(t) >= const Duration(minutes: 1));
    if (_runs.length >= maxRunsPerMinute) return false;
    _runs.add(now);
    return true;
  }

  Future<void> _run() async {
    if (_disposed) return;
    if (!_allowRun()) {
      // Too many renewals in a minute: whatever is wrong, hammering the
      // server will not fix it. Try once more after the floor.
      if (!_paused && _expiresAt != null) {
        _pending?.cancel();
        _pending = _timer(minWait, () {
          _pending = null;
          unawaited(_run());
        });
      }
      return;
    }
    try {
      await _refresh();
      // Success: the session announces the new token and calls [schedule].
    } on Object {
      // A transport failure keeps the refresh token; try again shortly
      // while the current access token still lives.
      final exp = _expiresAt;
      if (_disposed || _paused || exp == null || !_now().isBefore(exp)) return;
      _pending?.cancel();
      _pending = _timer(retryAfter, () {
        _pending = null;
        unawaited(_run());
      });
    }
  }
}
