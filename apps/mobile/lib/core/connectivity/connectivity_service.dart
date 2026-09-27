import 'dart:async';
import 'dart:math' as math;

import 'package:lawbid/core/connectivity/connectivity_status.dart';
import 'package:lawbid/core/connectivity/network_interface_monitor.dart';
import 'package:lawbid/core/connectivity/reachability.dart';

/// Checks whether the API answers at all (e.g. `GET /health/live`).
/// Must not throw: return false on any failure.
typedef ReachabilityProbe = Future<bool> Function();

/// Creates a one-shot timer — injectable so backoff is testable without
/// real time.
typedef TimerFactory = Timer Function(Duration delay, void Function() run);

/// Single source of truth for "is the app online" (docs/01 §8.3 "Offline
/// (баннер сверху, показ кэша)"), combining:
///
/// 1. the OS interface signal ([NetworkInterfaceMonitor], connectivity_plus)
///    — no interface means offline, immediately;
/// 2. real reachability from the app's own traffic ([ReachabilitySignal],
///    fed by `ReachabilityInterceptor` in the dio chain) — an interface can
///    be up while the API is unreachable (captive portal, dead Wi-Fi);
/// 3. an active [ReachabilityProbe] used to confirm recovery: while the
///    server is unreachable it re-probes with exponential backoff
///    ([initialBackoff] doubling up to [maxBackoff]), and right away when
///    the interface comes back or the user taps Retry ([retryNow]).
///
/// Emits distinct [ConnectivityStatus] values on [changes]; [status] is the
/// latest. Starts optimistic (online) so a cold start never flashes the
/// banner before the first real signal.
class ConnectivityService {
  ConnectivityService({
    required NetworkInterfaceMonitor monitor,
    required ReachabilitySignal reachability,
    required ReachabilityProbe probe,
    this.initialBackoff = const Duration(seconds: 2),
    this.maxBackoff = const Duration(seconds: 30),
    TimerFactory? timerFactory,
  })  : _monitor = monitor,
        _reachability = reachability,
        _probe = probe,
        _timerFactory = timerFactory ?? Timer.new;

  final NetworkInterfaceMonitor _monitor;
  final ReachabilitySignal _reachability;
  final ReachabilityProbe _probe;
  final TimerFactory _timerFactory;
  final Duration initialBackoff;
  final Duration maxBackoff;

  final StreamController<ConnectivityStatus> _changes =
      StreamController<ConnectivityStatus>.broadcast();

  StreamSubscription<bool>? _interfaceSub;
  StreamSubscription<bool>? _reachabilitySub;
  Timer? _retryTimer;
  Duration? _nextBackoff;
  Future<bool>? _inFlightProbe;
  bool _disposed = false;

  bool _hasNetwork = true;
  bool _serverReachable = true;

  /// An interface just came back and the probe hasn't answered yet: keep
  /// reporting [OfflineReason.noNetwork] (not "server unreachable", which
  /// would be a misleading message during a normal reconnect).
  bool _confirmingRecovery = false;
  ConnectivityStatus _status = const ConnectivityStatus.online();

  ConnectivityStatus get status => _status;
  Stream<ConnectivityStatus> get changes => _changes.stream;

  /// True while a probe is running (drives the banner's busy Retry).
  bool get isChecking => _inFlightProbe != null;

  /// Subscribes to both signals and reads the initial interface state.
  Future<void> start() async {
    _interfaceSub = _monitor.changes.listen(_onInterfaceChanged);
    _reachabilitySub = _reachability.changes.listen(_onReachabilityChanged);
    if (_reachability.lastKnown == false) _onReachabilityChanged(false);
    final hasNetwork = await _monitor.hasNetwork();
    if (_disposed) return;
    _onInterfaceChanged(hasNetwork);
  }

  /// User-initiated re-check (banner Retry). Returns whether we're online.
  Future<bool> retryNow() async {
    if (!_hasNetwork) {
      _hasNetwork = await _monitor.hasNetwork();
      if (_disposed) return false;
      if (!_hasNetwork) {
        _emit();
        return false;
      }
    }
    return _runProbe();
  }

  void _onInterfaceChanged(bool hasNetwork) {
    if (_disposed) return;
    final regained = hasNetwork && !_hasNetwork;
    _hasNetwork = hasNetwork;
    if (!hasNetwork) {
      // Nothing to probe until an interface is back.
      _confirmingRecovery = false;
      _cancelRetry();
      _emit();
      return;
    }
    if (regained) {
      // Don't trust the OS alone: an interface coming up (e.g. joining a
      // captive-portal Wi-Fi) isn't proof the API is reachable. Stay
      // offline until the probe answers.
      _confirmingRecovery = true;
      _emit();
      unawaited(_runProbe());
      return;
    }
    _emit();
  }

  void _onReachabilityChanged(bool reachable) {
    if (_disposed) return;
    _serverReachable = reachable;
    if (reachable) {
      _confirmingRecovery = false;
      _cancelRetry();
    } else if (_hasNetwork) {
      _scheduleRetry();
    }
    _emit();
  }

  Future<bool> _runProbe() {
    return _inFlightProbe ??= () async {
      bool ok;
      try {
        ok = await _probe();
      } on Object {
        ok = false;
      }
      _inFlightProbe = null;
      if (_disposed) return false;
      _confirmingRecovery = false;
      _serverReachable = ok;
      if (ok) {
        _cancelRetry();
        _reachability.markReachable();
      } else {
        _reachability.markUnreachable();
        if (_hasNetwork) _scheduleRetry();
      }
      _emit();
      return ok && _hasNetwork;
    }();
  }

  void _scheduleRetry() {
    if (_retryTimer?.isActive ?? false) return;
    final delay = _nextBackoff ?? initialBackoff;
    _nextBackoff = Duration(
      microseconds: math.min(
        delay.inMicroseconds * 2,
        maxBackoff.inMicroseconds,
      ),
    );
    _retryTimer = _timerFactory(delay, () {
      _retryTimer = null;
      if (_disposed || !_hasNetwork || _serverReachable) return;
      unawaited(_runProbe());
    });
  }

  void _cancelRetry() {
    _retryTimer?.cancel();
    _retryTimer = null;
    _nextBackoff = null;
  }

  /// Emits only when the status actually changes.
  void _emit() {
    if (_disposed) return;
    final next = !_hasNetwork || _confirmingRecovery
        ? const ConnectivityStatus.offline(OfflineReason.noNetwork)
        : _serverReachable
            ? const ConnectivityStatus.online()
            : const ConnectivityStatus.offline(
                OfflineReason.serverUnreachable,
              );
    if (next == _status) return;
    _status = next;
    _changes.add(next);
  }

  Future<void> dispose() async {
    _disposed = true;
    _cancelRetry();
    await _interfaceSub?.cancel();
    await _reachabilitySub?.cancel();
    await _changes.close();
  }
}
