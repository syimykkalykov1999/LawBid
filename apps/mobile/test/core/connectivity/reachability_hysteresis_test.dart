// ignore_for_file: cascade_invocations, unawaited_futures

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/reachability.dart';

void main() {
  final t0 = DateTime(2026, 10, 23, 12);

  test('one failure is not offline; the first success clears it', () {
    fakeAsync((async) {
      final events = <bool>[];
      final s = ReachabilitySignal(now: () => async.getClock(t0).now());
      s.changes.listen(events.add);
      s.markUnreachable();
      expect(s.lastKnown, isNull);
      s.markReachable();
      expect(events, [true]);
      s.markUnreachable();
      s.markReachable(); // the counter restarted
      s.markUnreachable();
      expect(s.lastKnown, isTrue);
      async.elapse(const Duration(seconds: 7));
      s.markReachable();
      async.elapse(const Duration(seconds: 30));
      expect(s.lastKnown, isTrue);
    });
  });

  test('two failures in a row mean offline, the first success brings back', () {
    fakeAsync((async) {
      final events = <bool>[];
      final s = ReachabilitySignal(now: () => async.getClock(t0).now());
      s.changes.listen(events.add);
      s
        ..markReachable()
        ..markUnreachable();
      expect(s.lastKnown, isTrue);
      s.markUnreachable();
      expect(s.lastKnown, isFalse);
      s.markReachable();
      expect(events, [true, false, true]);
    });
  });

  test('8 s after the first failure with no success also means offline', () {
    fakeAsync((async) {
      final s = ReachabilitySignal(now: () => async.getClock(t0).now());
      s.markReachable();
      s.markUnreachable();
      async.elapse(const Duration(seconds: 7, milliseconds: 999));
      expect(s.lastKnown, isTrue);
      async.elapse(const Duration(milliseconds: 1));
      expect(s.lastKnown, isFalse);
    });
  });

  test('failures in the background are ignored', () {
    fakeAsync((async) {
      final s = ReachabilitySignal(now: () => async.getClock(t0).now());
      s.markReachable();
      s.setBackground(true);
      s
        ..markUnreachable()
        ..markUnreachable()
        ..markUnreachable();
      async.elapse(const Duration(minutes: 1));
      expect(s.lastKnown, isTrue);
      s.setBackground(false);
      s.markUnreachable(); // a single one again
      expect(s.lastKnown, isTrue);
    });
  });

  test('a pending failure forgotten on going to the background', () {
    fakeAsync((async) {
      final s = ReachabilitySignal(now: () => async.getClock(t0).now());
      s.markReachable();
      s.markUnreachable();
      s.setBackground(true);
      async.elapse(const Duration(seconds: 30));
      expect(s.lastKnown, isTrue);
    });
  });
}
