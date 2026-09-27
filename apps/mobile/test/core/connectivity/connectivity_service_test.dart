import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/connectivity_service.dart';
import 'package:lawbid/core/connectivity/connectivity_status.dart';
import 'package:lawbid/core/connectivity/reachability.dart';

import '../../helpers/ux_harness.dart';

/// Timer factory that records scheduled delays and fires them on demand.
class ManualTimers {
  final List<Duration> scheduled = [];
  final List<_ManualTimer> _pending = [];

  Timer call(Duration delay, void Function() run) {
    scheduled.add(delay);
    final timer = _ManualTimer(run);
    _pending.add(timer);
    return timer;
  }

  int get active => _pending.where((t) => t.isActive).length;

  /// Fires every active timer once.
  void fireAll() {
    final due = List.of(_pending.where((t) => t.isActive));
    _pending.clear();
    for (final t in due) {
      t.fire();
    }
  }
}

class _ManualTimer implements Timer {
  _ManualTimer(this._run);

  final void Function() _run;
  bool _active = true;

  void fire() {
    if (!_active) return;
    _active = false;
    _run();
  }

  @override
  void cancel() => _active = false;

  @override
  bool get isActive => _active;

  @override
  int get tick => 0;
}

void main() {
  late FakeNetworkMonitor monitor;
  late ReachabilitySignal signal;
  late FakeProbe probe;
  late ManualTimers timers;
  late ConnectivityService service;
  late List<ConnectivityStatus> emitted;

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<void> startService({bool networkUp = true}) async {
    monitor = FakeNetworkMonitor(up: networkUp);
    signal = ReachabilitySignal();
    probe = FakeProbe();
    timers = ManualTimers();
    service = ConnectivityService(
      monitor: monitor,
      reachability: signal,
      probe: probe.call,
      timerFactory: timers.call,
    );
    emitted = [];
    service.changes.listen(emitted.add);
    await service.start();
    await settle();
  }

  tearDown(() async {
    await service.dispose();
    await monitor.close();
    await signal.dispose();
  });

  const online = ConnectivityStatus.online();
  const noNetwork = ConnectivityStatus.offline(OfflineReason.noNetwork);
  const unreachable =
      ConnectivityStatus.offline(OfflineReason.serverUnreachable);

  test('starts online when an interface is up, without probing', () async {
    await startService();
    expect(service.status, online);
    expect(emitted, isEmpty);
    expect(probe.calls, 0);
  });

  test('starts offline(noNetwork) when the OS reports no interface', () async {
    await startService(networkUp: false);
    expect(service.status, noNetwork);
    expect(emitted, [noNetwork]);
  });

  test('interface loss goes offline at once and schedules no probes', () async {
    await startService();
    monitor.set(false);
    await settle();
    expect(service.status, noNetwork);
    expect(timers.active, 0);
  });

  test(
      'interface regained stays offline until the probe confirms, '
      'then goes online', () async {
    await startService(networkUp: false);
    probe.hold = Completer<void>();
    monitor.set(true);
    await settle();
    // Still offline while the confirmation probe is in flight — and with
    // the noNetwork reason, not a misleading "server unreachable".
    expect(service.status, noNetwork);
    expect(service.isChecking, isTrue);
    expect(probe.calls, 1);

    probe.hold!.complete();
    await settle();
    expect(service.status, online);
    expect(signal.lastKnown, isTrue);
    expect(emitted, [noNetwork, online]);
  });

  test('interface regained but API unreachable → serverUnreachable', () async {
    await startService(networkUp: false);
    probe.result = false;
    monitor.set(true);
    await settle();
    expect(service.status, unreachable);
    expect(timers.active, 1, reason: 'a backoff re-probe is scheduled');
  });

  test('a dio connection failure (signal) marks the server unreachable',
      () async {
    await startService();
    signal.markUnreachable();
    await settle();
    expect(service.status, unreachable);
    expect(timers.scheduled, [const Duration(seconds: 2)]);
  });

  test('any later HTTP response (signal) brings it back online', () async {
    await startService();
    signal.markUnreachable();
    await settle();
    signal.markReachable();
    await settle();
    expect(service.status, online);
    expect(timers.active, 0, reason: 'pending re-probe cancelled');
    expect(emitted, [unreachable, online]);
  });

  test('re-probes with exponential backoff capped at maxBackoff', () async {
    await startService();
    probe.result = false;
    signal.markUnreachable();
    await settle();
    for (var i = 0; i < 6; i++) {
      timers.fireAll();
      await settle();
    }
    expect(probe.calls, 6);
    expect(
      timers.scheduled.map((d) => d.inSeconds).toList(),
      [2, 4, 8, 16, 30, 30, 30],
    );
    expect(service.status, unreachable);

    // Recovery resets the backoff.
    probe.result = true;
    timers.fireAll();
    await settle();
    expect(service.status, online);
    signal.markUnreachable();
    await settle();
    expect(timers.scheduled.last, const Duration(seconds: 2));
  });

  test('retryNow probes immediately and reports the outcome', () async {
    await startService();
    probe.result = false;
    signal.markUnreachable();
    await settle();
    expect(await service.retryNow(), isFalse);
    probe.result = true;
    expect(await service.retryNow(), isTrue);
    expect(service.status, online);
    expect(probe.calls, 2);
  });

  test('retryNow without an interface re-reads the OS state, no probe',
      () async {
    await startService(networkUp: false);
    expect(await service.retryNow(), isFalse);
    expect(probe.calls, 0);
    expect(service.status, noNetwork);
  });

  test('concurrent retries share one in-flight probe', () async {
    await startService();
    signal.markUnreachable();
    await settle();
    probe.hold = Completer<void>();
    final a = service.retryNow();
    final b = service.retryNow();
    probe.hold!.complete();
    expect(await Future.wait([a, b]), [true, true]);
    expect(probe.calls, 1);
  });

  test('a throwing probe counts as unreachable, never crashes', () async {
    monitor = FakeNetworkMonitor();
    signal = ReachabilitySignal();
    probe = FakeProbe();
    timers = ManualTimers();
    service = ConnectivityService(
      monitor: monitor,
      reachability: signal,
      probe: () async => throw StateError('boom'),
      timerFactory: timers.call,
    );
    await service.start();
    expect(await service.retryNow(), isFalse);
    expect(service.status, unreachable);
  });

  test('no emissions after dispose', () async {
    await startService();
    await service.dispose();
    monitor.set(false);
    signal.markUnreachable();
    await settle();
    expect(emitted, isEmpty);
  });
}
