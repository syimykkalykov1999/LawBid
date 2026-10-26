// ignore_for_file: cascade_invocations, unawaited_futures

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/reachability.dart';

void main() {
  final t0 = DateTime(2026, 10, 23, 12);

  ReachabilitySignal make(FakeAsync async) =>
      ReachabilitySignal(now: () => async.getClock(t0).now());

  test('one failure is not offline; a success resets the count', () {
    fakeAsync((async) {
      final events = <bool>[];
      final s = make(async);
      s.changes.listen(events.add);
      s.markUnreachable();
      expect(s.lastKnown, isNull);
      s.markReachable();
      expect(events, [true]);
      s.markUnreachable();
      s.markReachable();
      s.markUnreachable();
      async.elapse(const Duration(seconds: 60));
      expect(s.lastKnown, isTrue);
    });
  });

  test('two failures alone are not enough: they must last 8 s', () {
    fakeAsync((async) {
      final events = <bool>[];
      final s = make(async);
      s.changes.listen(events.add);
      s.markReachable();
      s.markUnreachable();
      s.markUnreachable();
      expect(s.lastKnown, isTrue);
      async.elapse(const Duration(seconds: 7, milliseconds: 999));
      expect(s.lastKnown, isTrue);
      async.elapse(const Duration(milliseconds: 1));
      expect(s.lastKnown, isFalse);
      s.markReachable(); // the first success brings it back at once
      expect(events, [true, false, true]);
    });
  });

  test('a success inside the window cancels the pending offline', () {
    fakeAsync((async) {
      final s = make(async);
      s.markReachable();
      s.markUnreachable();
      s.markUnreachable();
      async.elapse(const Duration(seconds: 5));
      s.markReachable();
      async.elapse(const Duration(seconds: 30));
      expect(s.lastKnown, isTrue);
    });
  });

  test('a late second failure after 8 s counts at once', () {
    fakeAsync((async) {
      final s = make(async);
      s.markReachable();
      s.markUnreachable();
      async.elapse(const Duration(seconds: 9));
      expect(s.lastKnown, isTrue);
      s.markUnreachable();
      expect(s.lastKnown, isFalse);
    });
  });

  test('failures in the background are ignored and forgotten', () {
    fakeAsync((async) {
      final s = make(async);
      s.markReachable();
      s.setBackground(true);
      s
        ..markUnreachable()
        ..markUnreachable()
        ..markUnreachable();
      async.elapse(const Duration(minutes: 1));
      expect(s.lastKnown, isTrue);
      s.setBackground(false);
      s.markUnreachable();
      async.elapse(const Duration(seconds: 30));
      expect(s.lastKnown, isTrue);
    });
  });
}
