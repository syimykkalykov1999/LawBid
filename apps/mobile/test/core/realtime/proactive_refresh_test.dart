// ignore_for_file: cascade_invocations, unawaited_futures

import 'dart:convert';
import 'dart:math';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/realtime/realtime_timings.dart';
import 'package:lawbid/core/session/proactive_refresh.dart';

String _jwt(DateTime exp) {
  String enc(Map<String, Object?> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${enc({'alg': 'none'})}.'
      '${enc({'exp': exp.millisecondsSinceEpoch ~/ 1000})}.sig';
}

void main() {
  group('jwtExpiry', () {
    test('reads exp', () {
      final exp = DateTime.utc(2026, 10, 23, 12);
      expect(jwtExpiry(_jwt(exp)), exp);
    });
    test('null for junk', () {
      expect(jwtExpiry('nope'), isNull);
      expect(jwtExpiry('a.!!!.c'), isNull);
    });
  });

  group('RealtimeTimings', () {
    test('defaults', () {
      const t = RealtimeTimings();
      expect(
        [t.reconnectMinMs, t.reconnectMaxMs, t.offlineFailures],
        [1000, 30000, 2],
      );
      expect(
        [t.offlineSeconds, t.tokenRefreshLeadSec, t.pollingFallbackAfter],
        [8, 120, 3],
      );
    });

    test('server values override, junk falls back', () {
      final t = RealtimeTimings.fromJson({
        'reconnectMinMs': 2000,
        'tokenRefreshLeadSec': 90,
        'jitter': 0.5,
        'offlineSeconds': 'x',
        'pollingFallbackAfter': -4,
      });
      expect(t.reconnectMinMs, 2000);
      expect(t.tokenRefreshLeadSec, 90);
      expect(t.jitter, 0.5);
      expect(t.offlineSeconds, 8);
      expect(t.pollingFallbackAfter, 1);
    });

    test('reads the contract keys of REALTIME_LIFECYCLE.md', () {
      final t = RealtimeTimings.fromJson({
        'reconnectJitter': 0.25,
        'serverDisconnectMinWaitMs': 2000,
        'serverDisconnectMaxWaitMs': 9000,
        'probeTimeoutMs': 4000,
        'tokenRefreshLeadSeconds': 100,
        'pollingFallbackIntervalSeconds': 45,
        'reconnectedDebounceSeconds': 7,
        'refetchJitterMs': 1500,
        'pingIntervalMs': 25000,
      });
      expect(t.jitter, 0.25);
      expect(t.serverDisconnectMinWaitMs, 2000);
      expect(t.serverDisconnectMaxWaitMs, 9000);
      expect(t.probeTimeoutMs, 4000);
      expect(t.tokenRefreshLeadSec, 100);
      expect(t.pollingFallbackIntervalSeconds, 45);
      expect(t.reconnectedDebounceSeconds, 7);
      expect(t.refetchJitterMs, 1500);
      // Server defaults when nothing is sent.
      expect(const RealtimeTimings().jitter, 0.5);
    });

    test('reads client.timings from app_config, both shapes', () {
      expect(
        RealtimeTimings.fromAppConfig(
          {'client.timings': '{"reconnectMaxMs":20000}'},
        ).reconnectMaxMs,
        20000,
      );
      expect(
        RealtimeTimings.fromAppConfig(
          {'client': '{"timings":{"offlineFailures":3}}'},
        ).offlineFailures,
        3,
      );
      expect(
        RealtimeTimings.fromAppConfig({'client.timings': '{oops'})
            .reconnectMinMs,
        1000,
      );
      expect(RealtimeTimings.fromAppConfig({}).offlineSeconds, 8);
      // The admin panel's flat knobs, overridden by the object where given.
      final flat = RealtimeTimings.fromAppConfig({
        'client.realtime_reconnect_min_ms': '2000',
        'client.realtime_reconnect_max_ms': '60000',
      });
      expect([flat.reconnectMinMs, flat.reconnectMaxMs], [2000, 60000]);
      final both = RealtimeTimings.fromAppConfig({
        'client.realtime_reconnect_max_ms': '60000',
        'client.timings': '{"reconnectMaxMs":20000}',
      });
      expect(both.reconnectMaxMs, 20000);
    });
  });

  group('ProactiveTokenRefresher (fake clock)', () {
    final t0 = DateTime(2026, 10, 23, 12);

    test('refreshes 120 s before exp, once', () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async => calls++,
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
        );
        r.schedule(t0.add(const Duration(minutes: 15)));
        async.elapse(const Duration(minutes: 12, seconds: 59));
        expect(calls, 0);
        async.elapse(const Duration(seconds: 1));
        expect(calls, 1);
        async.elapse(const Duration(minutes: 20));
        expect(calls, 1);
      });
    });

    test('uses the server-tuned lead', () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async => calls++,
          timings: () => const RealtimeTimings(tokenRefreshLeadSec: 60),
          now: () => async.getClock(t0).now(),
        );
        r.schedule(t0.add(const Duration(minutes: 15)));
        async.elapse(const Duration(minutes: 13, seconds: 59));
        expect(calls, 0);
        async.elapse(const Duration(seconds: 1));
        expect(calls, 1);
      });
    });

    test('a new token re-plans: only the latest timer fires', () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async => calls++,
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
        );
        r.schedule(t0.add(const Duration(minutes: 15)));
        async.elapse(const Duration(minutes: 5));
        r.schedule(t0.add(const Duration(minutes: 30)));
        async.elapse(const Duration(minutes: 10)); // t = 15 min
        expect(calls, 0);
        async.elapse(const Duration(minutes: 13)); // t = 28 min = 30 - 2
        expect(calls, 1);
      });
    });

    test('resume: refresh at once when under 5 min remain, else just re-arm',
        () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async => calls++,
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
        );
        r.schedule(t0.add(const Duration(minutes: 15)));
        r.pause();
        expect(r.hasTimer, isFalse);
        async.elapse(const Duration(minutes: 9)); // 6 min left
        r.ensureFresh();
        async.flushMicrotasks();
        expect(calls, 0);
        expect(r.hasTimer, isTrue);

        r.pause();
        async.elapse(const Duration(minutes: 2)); // 4 min left
        r.ensureFresh();
        async.flushMicrotasks();
        expect(calls, 1);
      });
    });

    test('a token already inside the lead is renewed after the 30 s floor', () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async => calls++,
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
          random: Random(1),
        );
        r.schedule(t0.subtract(const Duration(minutes: 1)));
        async.elapse(const Duration(seconds: 29));
        expect(calls, 0);
        async.elapse(const Duration(seconds: 7)); // floor 30 s + jitter < 5 s
        expect(calls, 1);
      });
    });

    test('a clock that is far off never gives a refresh per second', () {
      fakeAsync((async) {
        var calls = 0;
        late ProactiveTokenRefresher r;
        // Every refresh "succeeds" and announces a token whose end is,
        // by this phone's clock, already long past (clock hours ahead).
        r = ProactiveTokenRefresher(
          refresh: () async {
            calls++;
            r.schedule(t0.subtract(const Duration(hours: 5)));
          },
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
          random: Random(1),
        )..schedule(t0.subtract(const Duration(hours: 5)));
        async.elapse(const Duration(minutes: 10));
        // At most one renewal per 30 s floor: 20 in ten minutes, never 600.
        expect(calls, lessThanOrEqualTo(20));
        expect(calls, greaterThan(0));
      });
    });

    test('never more than maxRunsPerMinute renewals in a minute', () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async => calls++,
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
          random: Random(1),
        )..schedule(t0.add(const Duration(hours: 1)));
        for (var i = 0; i < 10; i++) {
          r.refreshNow();
        }
        async.flushMicrotasks();
        expect(calls, 3);
        // The denied ones are retried after the floor, not dropped.
        async.elapse(const Duration(minutes: 2));
        expect(calls, greaterThan(3));
      });
    });

    test('a failed refresh is retried while the token still lives', () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async {
            calls++;
            throw StateError('offline');
          },
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
        );
        r.schedule(t0.add(const Duration(minutes: 15)));
        async.elapse(const Duration(minutes: 13, seconds: 1)); // first try
        expect(calls, 1);
        async.elapse(const Duration(seconds: 15));
        expect(calls, 2);
        // Past the end of the token: stop trying (the 401 path takes over).
        async.elapse(const Duration(minutes: 5));
        final seen = calls;
        async.elapse(const Duration(minutes: 5));
        expect(calls, seen);
      });
    });

    test('refreshNow (auth:expiring) renews immediately', () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async => calls++,
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
        );
        r.refreshNow();
        async.flushMicrotasks();
        expect(calls, 1);
      });
    });

    test('clear cancels everything', () {
      fakeAsync((async) {
        var calls = 0;
        final r = ProactiveTokenRefresher(
          refresh: () async => calls++,
          timings: () => const RealtimeTimings(),
          now: () => async.getClock(t0).now(),
        )..schedule(t0.add(const Duration(minutes: 15)));
        r.clear();
        async.elapse(const Duration(hours: 1));
        expect(calls, 0);
      });
    });
  });
}
