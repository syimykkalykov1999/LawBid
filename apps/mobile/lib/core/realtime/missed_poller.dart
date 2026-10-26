import 'dart:async';

import 'package:lawbid/core/realtime/reconnect_controller.dart';

/// Owner 2026-10-23 (realtime lifecycle, polling fallback): while the socket
/// stays down the app still hears about new things, once per
/// `pollingFallbackIntervalSeconds`, through `GET /realtime/missed`. It
/// starts when the socket drops, ticks every interval, and stops the moment
/// the socket is back or the app / tab goes to the background. It never
/// touches the reconnect logic — that keeps trying on its own schedule.
class MissedPoller {
  MissedPoller({
    required Duration Function() interval,
    required bool Function() canPoll,
    required Future<void> Function() poll,
    TimerFactory? timer,
  })  : _interval = interval,
        _canPoll = canPoll,
        _poll = poll,
        _timer = timer ?? Timer.new;

  final Duration Function() _interval;

  /// Foreground, signed in, socket still down.
  final bool Function() _canPoll;
  final Future<void> Function() _poll;
  final TimerFactory _timer;

  Timer? _pending;
  bool _running = false;
  bool _inFlight = false;

  bool get running => _running;

  /// The socket is down: the first poll comes one interval from now (a
  /// short blip reconnects before it), then one per interval. A second call
  /// while running changes nothing.
  void start() {
    if (_running || !_canPoll()) return;
    _running = true;
    _arm();
  }

  /// The socket is back, or the app went to the background.
  void stop() {
    _running = false;
    _pending?.cancel();
    _pending = null;
  }

  void _arm() {
    _pending = _timer(_interval(), () {
      _pending = null;
      unawaited(_tick());
    });
  }

  Future<void> _tick() async {
    if (!_running) return;
    if (!_canPoll()) {
      stop();
      return;
    }
    if (!_inFlight) {
      _inFlight = true;
      try {
        await _poll();
      } on Object {
        // Still offline or the server is busy: the next tick tries again.
      } finally {
        _inFlight = false;
      }
    }
    if (_running && _canPoll()) {
      // A stop() + start() during the request already armed a new timer.
      if (_pending == null) _arm();
    } else {
      stop();
    }
  }
}
