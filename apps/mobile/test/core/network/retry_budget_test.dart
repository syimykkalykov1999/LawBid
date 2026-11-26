import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/network/request_priority.dart';
import 'package:lawbid/core/network/retry_budget.dart';
import 'package:lawbid/core/network/retry_interceptor.dart';
import 'package:lawbid/core/network/timeout_budget_interceptor.dart';

import '../../helpers/fake_http_adapter.dart';

/// Always draws [value], so a rejection probability p rejects iff value < p.
class _FixedRandom implements Random {
  _FixedRandom(this.value);
  final double value;
  @override
  double nextDouble() => value;
  @override
  int nextInt(int max) => 0;
  @override
  bool nextBool() => false;
}

/// Stage 2 SRE (Б5): retry budget (gRFC A6), client-side throttling (SRE
/// ch. 21) and the deadline header (SRE ch. 22, Envoy-style).
void main() {
  setUp(ClientTuning.reset);
  tearDown(() {
    ClientTuning.reset();
    RequestPriority.lastConfig = null;
  });

  group('RetryThrottle (gRFC A6, grpc-java RetriableStream.Throttle)', () {
    test('starts full; a repeat only while more than half the tokens are left',
        () {
      final t = RetryThrottle(maxTokens: 10, tokenRatio: 0.1);
      expect(t.tokens, 10);
      final verdicts = [
        for (var i = 0; i < 6; i++)
          t.onQualifiedFailureThenCheckIsAboveThreshold(),
      ];
      // 9, 8, 7, 6 > 5 → repeat; 5, 4 → no.
      expect(verdicts, [true, true, true, true, false, false]);
      expect(t.isAboveThreshold, isFalse);
    });

    test('answers give back tokenRatio each, never above the max', () {
      final t = RetryThrottle(maxTokens: 10, tokenRatio: 0.1);
      for (var i = 0; i < 6; i++) {
        t.onQualifiedFailureThenCheckIsAboveThreshold();
      }
      expect(t.tokens, 4);
      for (var i = 0; i < 20; i++) {
        t.onSuccess();
      }
      expect(t.tokens, closeTo(6, 1e-9));
      expect(t.isAboveThreshold, isTrue);
      for (var i = 0; i < 1000; i++) {
        t.onSuccess();
      }
      expect(t.tokens, 10);
    });

    test('never goes below zero', () {
      final t = RetryThrottle(maxTokens: 2, tokenRatio: 0.5);
      for (var i = 0; i < 5; i++) {
        t.onQualifiedFailureThenCheckIsAboveThreshold();
      }
      expect(t.tokens, 0);
    });
  });

  group('RetryInterceptor with the budget', () {
    late FakeHttpAdapter adapter;
    late Dio dio;

    setUp(() {
      adapter = FakeHttpAdapter((o) async => ok(const {}));
      dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = adapter;
      dio.interceptors.add(
        RetryInterceptor(
          dio,
          baseDelay: const Duration(milliseconds: 1),
          sleep: (_) async {},
          throttle: AdaptiveThrottle(
            k: () => 0, // only the budget in this group
            window: () => const Duration(minutes: 2),
          ),
        ),
      );
    });

    test('10 failing requests in a row: the later ones are not repeated',
        () async {
      adapter.handler = (o) async => throwConnectionError(o);
      final perRequest = <int>[];
      for (var i = 0; i < 10; i++) {
        final before = adapter.requests.length;
        await expectLater(dio.get<dynamic>('/x'), throwsA(isA<DioException>()));
        perRequest.add(adapter.requests.length - before);
      }
      // 10 tokens: 9, 8, 7 (3 tries) · 6, 5 (2 tries) · then 1 try each.
      expect(perRequest, [3, 2, 1, 1, 1, 1, 1, 1, 1, 1]);
      // Before the budget every one was tried 3 times (30 on the wire).
      expect(adapter.requests, hasLength(13));
    });

    test('answers earn repeats back', () async {
      adapter.handler = (o) async => throwConnectionError(o);
      for (var i = 0; i < 3; i++) {
        await expectLater(dio.get<dynamic>('/x'), throwsA(isA<DioException>()));
      }
      adapter.handler = (o) async => ok(const {});
      for (var i = 0; i < 30; i++) {
        await dio.get<dynamic>('/ok');
      }
      var calls = 0;
      adapter.handler = (o) async {
        calls++;
        if (calls == 1) throwConnectionError(o);
        return ok(const {});
      };
      await dio.get<dynamic>('/again');
      expect(calls, 2, reason: 'the budget refilled, one repeat allowed');
    });

    test('the server decides the numbers (client.retry_tokens_max)', () async {
      ClientTuning.apply(const {'client.retry_tokens_max': '2'});
      adapter.handler = (o) async => throwConnectionError(o);
      await expectLater(dio.get<dynamic>('/x'), throwsA(isA<DioException>()));
      // 2 tokens: the first failure leaves 1, not more than half → no repeat.
      expect(adapter.requests, hasLength(1));
    });
  });

  group('AdaptiveThrottle (SRE ch. 21 client-side throttling)', () {
    test('p = max(0, (requests − K·accepts) / (requests + 1))', () {
      final t = AdaptiveThrottle(
        k: () => 2,
        window: () => const Duration(minutes: 2),
        random: _FixedRandom(0.99),
      );
      for (var i = 0; i < 10; i++) {
        t
          ..admit(mayReject: false)
          ..settle(accepted: false);
      }
      expect(t.rejectProbability, closeTo(10 / 11, 1e-9));
      for (var i = 0; i < 10; i++) {
        t
          ..admit(mayReject: false)
          ..settle(accepted: true);
      }
      // 20 requests, 10 accepts: 20 − 2·10 = 0.
      expect(t.rejectProbability, 0);
    });

    test('only the window counts', () {
      var now = DateTime(2026, 11, 25, 12);
      final t = AdaptiveThrottle(
        k: () => 2,
        window: () => const Duration(minutes: 2),
        now: () => now,
      );
      for (var i = 0; i < 5; i++) {
        t
          ..admit(mayReject: false)
          ..settle(accepted: false);
      }
      expect(t.requests, 5);
      now = now.add(const Duration(minutes: 3));
      expect(t.requests, 0);
      expect(t.rejectProbability, 0);
    });

    test('K = 0 is off', () {
      final t = AdaptiveThrottle(
        k: () => 0,
        window: () => const Duration(minutes: 2),
        random: _FixedRandom(0),
      );
      for (var i = 0; i < 50; i++) {
        t
          ..admit(mayReject: false)
          ..settle(accepted: false);
      }
      expect(t.admit(mayReject: true), isTrue);
    });

    test(
        'many 503 SERVER_BUSY: a prefetch is dropped before the wire, '
        'what a person waits for still goes out', () async {
      final adapter = FakeHttpAdapter(
        (o) async => apiError(503, 'SERVER_BUSY'),
      );
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = adapter;
      dio.interceptors.add(
        RetryInterceptor(
          dio,
          maxRetries: 0,
          sleep: (_) async {},
          throttle: AdaptiveThrottle(
            k: () => 2,
            window: () => const Duration(minutes: 2),
            random: _FixedRandom(0.5),
          ),
        ),
      );
      for (var i = 0; i < 10; i++) {
        await expectLater(dio.get<dynamic>('/x'), throwsA(isA<DioException>()));
      }
      expect(adapter.requests, hasLength(10));

      final dropped = await dio
          .get<dynamic>(
            '/next-page',
            options: RequestPriority.prefetch.options(),
          )
          .then<Object?>((_) => null, onError: (Object e) => e);
      expect(dropped, isA<DioException>());
      expect(
        (dropped! as DioException).error,
        RetryInterceptor.clientThrottled,
      );
      expect(adapter.requests, hasLength(10), reason: 'never sent');

      await expectLater(
        dio.get<dynamic>('/mine'),
        throwsA(isA<DioException>()),
      );
      expect(adapter.requests, hasLength(11), reason: 'user request sent');
    });
  });

  group('X-Request-Timeout-Ms (deadline propagation)', () {
    Future<RequestOptions> send(
      String path, {
      required bool allowed,
      Duration? receiveTimeout,
    }) async {
      final adapter = FakeHttpAdapter((o) async => ok(const {}));
      final dio = Dio(
        BaseOptions(
          baseUrl: 'http://test',
          receiveTimeout: receiveTimeout ?? const Duration(seconds: 15),
        ),
      )
        ..httpClientAdapter = adapter
        ..interceptors.add(
          TimeoutBudgetInterceptor(deadlineAllowed: () => allowed),
        );
      await dio.get<dynamic>(path);
      return adapter.requests.single;
    }

    test('sends how long the app waits, in ms', () async {
      final r = await send('/feed', allowed: true);
      expect(r.headers['X-Request-Timeout-Ms'], '15000');
    });

    test('the fast start reads send their shorter budget', () async {
      final r = await send('/me/session', allowed: true);
      expect(r.headers['X-Request-Timeout-Ms'], '8000');
    });

    test('nothing when not allowed', () async {
      final r = await send('/feed', allowed: false);
      expect(r.headers.containsKey('X-Request-Timeout-Ms'), isFalse);
    });

    test('website only after the bootstrap allows it; admin off = never', () {
      RequestPriority.lastConfig = null;
      expect(ClientTuning.deadlineHeaderAllowed(web: false), isTrue);
      expect(ClientTuning.deadlineHeaderAllowed(web: true), isFalse);
      RequestPriority.lastConfig = {'client.deadline_header_enabled': 'true'};
      expect(ClientTuning.deadlineHeaderAllowed(web: true), isTrue);
      RequestPriority.lastConfig = {'client.deadline_header_enabled': 'false'};
      expect(ClientTuning.deadlineHeaderAllowed(web: false), isFalse);
      expect(ClientTuning.deadlineHeaderAllowed(web: true), isFalse);
    });
  });
}
