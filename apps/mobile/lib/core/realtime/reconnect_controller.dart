import 'dart:async';
import 'dart:math' as math;

import 'package:lawbid/core/realtime/realtime_timings.dart';

/// Creates a one-shot timer; injectable so the schedule is testable.
typedef TimerFactory = Timer Function(Duration delay, void Function() run);

/// Exponential backoff with jitter (Owner 2026-10-23, part C3): the step
/// doubles from the minimum up to the maximum; with `jitter: 1` the wait is
/// anywhere between the minimum and the step ("full jitter"), so phones
/// that lost the server together do not come back together.
abstract final class ReconnectBackoff {
  /// The wait before the [attempt]-th retry (0 = first). [random] is a
  /// value in `[0, 1)`.
  static Duration delay(int attempt, RealtimeTimings t, double random) {
    final exp = attempt.clamp(0, 20);
    final step = math.min(t.reconnectMaxMs, t.reconnectMinMs * (1 << exp));
    final j = t.jitter.clamp(0.0, 1.0);
    final ms = (step * (1 - j + j * random.clamp(0.0, 1.0))).round();
    return Duration(milliseconds: math.max(t.reconnectMinMs, ms));
  }
}

/// Decides WHEN the socket tries again: backoff after a failure, an exact
/// wait after `server:going-away`, an immediate try when the app returns or
/// the network comes back, nothing while the app is in the background.
/// Knows nothing about Socket.IO — it calls `attempt`.
class ReconnectController {
  ReconnectController({
    required RealtimeTimings Function() timings,
    required bool Function() isConnected,
    required void Function() attempt,
    math.Random? random,
    TimerFactory? timer,
  })  : _timings = timings,
        _isConnected = isConnected,
        _attempt = attempt,
        _random = random ?? math.Random(),
        _timer = timer ?? Timer.new;

  final RealtimeTimings Function() _timings;
  final bool Function() _isConnected;
  final void Function() _attempt;
  final math.Random _random;
  final TimerFactory _timer;

  Timer? _pending;
  int _failures = 0;
  bool _paused = false;
  bool _holding = false;

  int get failures => _failures;
  bool get paused => _paused;
  bool get hasPendingAttempt => _pending?.isActive ?? false;

  /// After enough failed websocket attempts the next socket also allows
  /// long-polling (networks that block WebSocket).
  bool get usePolling => _failures >= _timings().pollingFallbackAfter;

  /// The socket could not connect or dropped. [serverClosed]: the server
  /// itself closed it (`io server disconnect`) — wait a random 1–15 s, the
  /// whole fleet may be restarting.
  void onFailure({bool serverClosed = false}) {
    _failures++;
    if (_paused || _holding || hasPendingAttempt) return;
    var wait = ReconnectBackoff.delay(
      _failures - 1,
      _timings(),
      _random.nextDouble(),
    );
    if (serverClosed) {
      final extra = Duration(milliseconds: 1000 + _random.nextInt(14000));
      if (extra > wait) wait = extra;
    }
    _schedule(wait);
  }

  void onConnected() {
    _failures = 0;
    _holding = false;
    _cancel();
  }

  /// `server:going-away {retryAfterMs}`: wait exactly that, whatever else
  /// fails in the meantime. Not counted as a failure.
  void onGoingAway(Duration retryAfter) {
    if (_paused) return;
    _cancel();
    _holding = true;
    _schedule(retryAfter.isNegative ? Duration.zero : retryAfter);
  }

  /// App in the background: keep the socket, stop the timers.
  void pause() {
    _paused = true;
    _holding = false;
    _cancel();
  }

  /// App back in front: try at once when not connected.
  void resume() {
    _paused = false;
    if (!_isConnected()) _fire();
  }

  /// The network came back: try at once when not connected.
  void networkBack() {
    if (_paused || _isConnected()) return;
    _fire();
  }

  void dispose() => _cancel();

  void _schedule(Duration wait) {
    _pending = _timer(wait, () {
      _pending = null;
      _holding = false;
      if (_paused || _isConnected()) return;
      _attempt();
    });
  }

  void _fire() {
    _cancel();
    _holding = false;
    _attempt();
  }

  void _cancel() {
    _pending?.cancel();
    _pending = null;
  }
}

/// Gives every subscriber its own random delay (0..[maxDelay]) for the
/// events [isTarget] picks, so N screens that all refetch on the same event
/// do not hit the server in the same instant.
Stream<T> spreadEvents<T>(
  Stream<T> source, {
  required bool Function(T) isTarget,
  Duration maxDelay = const Duration(seconds: 3),
  math.Random? random,
  TimerFactory? timer,
}) {
  final rnd = random ?? math.Random();
  final make = timer ?? Timer.new;
  return Stream<T>.multi(
    (controller) {
      final timers = <Timer>[];
      final sub = source.listen(
        (event) {
          if (!isTarget(event)) {
            controller.add(event);
            return;
          }
          final wait = Duration(
            milliseconds: (maxDelay.inMilliseconds * rnd.nextDouble()).round(),
          );
          late Timer t;
          t = make(wait, () {
            timers.remove(t);
            controller.add(event);
          });
          timers.add(t);
        },
        onError: controller.addError,
        onDone: controller.close,
      );
      controller.onCancel = () {
        for (final t in timers) {
          t.cancel();
        }
        return sub.cancel();
      };
    },
    isBroadcast: true,
  );
}
