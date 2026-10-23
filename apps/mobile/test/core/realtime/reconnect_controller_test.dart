import 'dart:async';
import 'dart:math';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/realtime/realtime_timings.dart';
import 'package:lawbid/core/realtime/reconnect_controller.dart';

/// A `Random` that returns a fixed value.
class _Fixed implements Random {
  _Fixed(this.value);
  final double value;
  @override
  bool nextBool() => value >= 0.5;
  @override
  double nextDouble() => value;
  @override
  int nextInt(int max) => (value * max).floor();
}

void main() {
  group('ReconnectBackoff', () {
    const t = RealtimeTimings();

    test('doubles from 1 s up to 30 s without jitter spread (random = 1)', () {
      final steps = [
        for (var i = 0; i < 8; i++)
          ReconnectBackoff.delay(i, t, 1).inMilliseconds,
      ];
      expect(steps, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    });

    test('full jitter: random 0 floors at the minimum, never below', () {
      for (var i = 0; i < 8; i++) {
        expect(ReconnectBackoff.delay(i, t, 0), const Duration(seconds: 1));
      }
    });

    test('full jitter stays inside [min, step] for any random', () {
      final r = Random(7);
      for (var i = 0; i < 200; i++) {
        final attempt = i % 9;
        final d = ReconnectBackoff.delay(attempt, t, r.nextDouble());
        final step = min(30000, 1000 * (1 << attempt));
        expect(d.inMilliseconds, inInclusiveRange(1000, step));
      }
    });

    test('server tuning: min 2 s, max 10 s, jitter 0.5', () {
      const tuned = RealtimeTimings(
        reconnectMinMs: 2000,
        reconnectMaxMs: 10000,
        jitter: 0.5,
      );
      // step 10 s at attempt 3; random 0 -> half of it, random 1 -> all.
      expect(ReconnectBackoff.delay(3, tuned, 0).inMilliseconds, 5000);
      expect(ReconnectBackoff.delay(3, tuned, 1).inMilliseconds, 10000);
      expect(ReconnectBackoff.delay(0, tuned, 0).inMilliseconds, 2000);
    });

    test('a huge attempt number does not overflow', () {
      expect(
        ReconnectBackoff.delay(500, t, 1),
        const Duration(milliseconds: 30000),
      );
    });
  });

  group('ReconnectController', () {
    late bool connected;
    late int attempts;
    late ReconnectController c;
    var timings = const RealtimeTimings();

    ReconnectController build({double random = 1}) => ReconnectController(
          timings: () => timings,
          isConnected: () => connected,
          attempt: () => attempts++,
          random: _Fixed(random),
        );

    setUp(() {
      connected = false;
      attempts = 0;
      timings = const RealtimeTimings();
    });

    test('failures retry on the backoff schedule and reset on success', () {
      fakeAsync((async) {
        c = build();
        c.onFailure(); // attempt 0 -> 1 s
        async.elapse(const Duration(milliseconds: 999));
        expect(attempts, 0);
        async.elapse(const Duration(milliseconds: 1));
        expect(attempts, 1);
        c.onFailure(); // 2 s
        async.elapse(const Duration(seconds: 2));
        expect(attempts, 2);
        c.onFailure(); // 4 s
        async.elapse(const Duration(seconds: 3));
        expect(attempts, 2);
        async.elapse(const Duration(seconds: 1));
        expect(attempts, 3);

        c.onConnected();
        expect(c.failures, 0);
        c.onFailure(); // back to 1 s
        async.elapse(const Duration(seconds: 1));
        expect(attempts, 4);
      });
    });

    test('a server-closed socket waits a random 1-15 s', () {
      fakeAsync((async) {
        c = build(random: 0.5);
        c.onFailure(serverClosed: true); // 1000 + 0.5 * 14000 = 8 s
        async.elapse(const Duration(milliseconds: 7999));
        expect(attempts, 0);
        async.elapse(const Duration(milliseconds: 1));
        expect(attempts, 1);
      });
    });

    test(
        'server:going-away waits exactly retryAfter, later failures '
        'do not shorten it', () {
      fakeAsync((async) {
        c = build(random: 0);
        c.onGoingAway(const Duration(seconds: 12));
        expect(c.failures, 0);
        c.onFailure(); // the dying server closes the socket
        c.onFailure(serverClosed: true);
        async.elapse(const Duration(seconds: 11));
        expect(attempts, 0);
        async.elapse(const Duration(seconds: 1));
        expect(attempts, 1);
      });
    });

    test('going-away replaces a backoff that is already waiting', () {
      fakeAsync((async) {
        c = build(random: 0);
        c.onFailure(); // 1 s
        c.onGoingAway(const Duration(seconds: 5));
        async.elapse(const Duration(seconds: 2));
        expect(attempts, 0);
        async.elapse(const Duration(seconds: 3));
        expect(attempts, 1);
      });
    });

    test('pause stops the timers; resume reconnects at once', () {
      fakeAsync((async) {
        c = build();
        c.onFailure();
        c.pause();
        async.elapse(const Duration(minutes: 5));
        expect(attempts, 0);
        c.onFailure(); // still nothing in the background
        async.elapse(const Duration(minutes: 5));
        expect(attempts, 0);
        c.resume();
        expect(attempts, 1);
      });
    });

    test('resume while connected does nothing', () {
      connected = true;
      c = build()
        ..pause()
        ..resume();
      expect(attempts, 0);
    });

    test('network back reconnects at once, unless connected or paused', () {
      c = build();
      c.networkBack();
      expect(attempts, 1);
      connected = true;
      c.networkBack();
      expect(attempts, 1);
      connected = false;
      c.pause();
      c.networkBack();
      expect(attempts, 1);
    });

    test('polling joins after N failed attempts and leaves on success', () {
      fakeAsync((async) {
        c = build();
        expect(c.usePolling, isFalse);
        c.onFailure();
        async.elapse(const Duration(seconds: 30));
        c.onFailure();
        async.elapse(const Duration(seconds: 30));
        expect(c.usePolling, isFalse);
        c.onFailure();
        expect(c.usePolling, isTrue);
        c.onConnected();
        expect(c.usePolling, isFalse);
      });
    });

    test('an attempt is skipped when the socket came back meanwhile', () {
      fakeAsync((async) {
        c = build();
        c.onFailure();
        connected = true;
        async.elapse(const Duration(seconds: 5));
        expect(attempts, 0);
      });
    });
  });

  group('spreadEvents (no reconnect storm)', () {
    test('N listeners get the event once each, spread over 0-3 s', () {
      fakeAsync((async) {
        final source = StreamController<String>.broadcast();
        final spread = spreadEvents<String>(
          source.stream,
          isTarget: (e) => e == 'reconnected',
          random: Random(3),
        );
        const n = 12;
        final at = <Duration>[];
        var other = 0;
        final started = async.getClock(DateTime(2026)).now();
        for (var i = 0; i < n; i++) {
          spread.listen((e) {
            if (e == 'reconnected') {
              at.add(async.getClock(DateTime(2026)).now().difference(started));
            } else {
              other++;
            }
          });
        }
        source
          ..add('reconnected')
          ..add('message:new');
        async.flushMicrotasks();
        // Ordinary events are immediate.
        expect(other, n);
        expect(at, isEmpty);

        async.elapse(const Duration(seconds: 3));
        expect(at.length, n);
        expect(at.every((d) => d <= const Duration(seconds: 3)), isTrue);
        // Not one burst: at most a third of the screens in any 250 ms.
        final buckets = <int, int>{};
        for (final d in at) {
          buckets.update(
            d.inMilliseconds ~/ 250,
            (v) => v + 1,
            ifAbsent: () => 1,
          );
        }
        expect(buckets.values.reduce(max), lessThanOrEqualTo(n ~/ 3));
        source.close();
      });
    });

    test('a listener that cancels gets nothing', () {
      fakeAsync((async) {
        final source = StreamController<String>.broadcast();
        final spread = spreadEvents<String>(
          source.stream,
          isTarget: (e) => true,
          random: _Fixed(1),
        );
        var got = 0;
        final sub = spread.listen((_) => got++);
        source.add('reconnected');
        async.flushMicrotasks();
        sub.cancel();
        async.elapse(const Duration(seconds: 5));
        expect(got, 0);
        source.close();
      });
    });
  });
}
