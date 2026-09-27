import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/network/retry_interceptor.dart';

import '../../helpers/fake_http_adapter.dart';

void main() {
  late FakeHttpAdapter adapter;
  late Dio dio;
  late List<Duration> sleeps;
  var keySeq = 0;

  setUp(() {
    sleeps = [];
    keySeq = 0;
    adapter = FakeHttpAdapter((o) async => ok({'ok': true}));
    dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
    dio.interceptors
      ..add(IdempotencyInterceptor(keyFactory: () => 'key-${++keySeq}'))
      ..add(
        RetryInterceptor(
          dio,
          baseDelay: const Duration(milliseconds: 100),
          sleep: (d) async => sleeps.add(d),
        ),
      );
  });

  group('IdempotencyInterceptor', () {
    test('stamps Idempotency-Key on resource-creating POSTs only', () async {
      await dio.post<dynamic>('/a', options: RequestFlags.createOptions());
      await dio.post<dynamic>('/b');
      await dio.get<dynamic>('/c', options: RequestFlags.createOptions());

      expect(adapter.requests[0].headers['Idempotency-Key'], 'key-1');
      expect(adapter.requests[1].headers.containsKey('Idempotency-Key'), isFalse);
      expect(adapter.requests[2].headers.containsKey('Idempotency-Key'), isFalse);
    });

    test('keeps a caller-supplied key', () async {
      await dio.post<dynamic>(
        '/a',
        options: Options(extra: const {RequestFlags.createsResource: true}, headers: {'idempotency-key': 'mine'}),
      );
      expect(adapter.requests.single.headers['idempotency-key'], 'mine');
      expect(keySeq, 0);
    });
  });

  group('RetryInterceptor', () {
    test('retries an idempotent GET on network errors with exponential backoff', () async {
      var calls = 0;
      adapter.handler = (o) async {
        calls++;
        if (calls < 3) throwConnectionError(o);
        return ok({'n': calls});
      };
      final res = await dio.get<Map<String, dynamic>>('/x');
      expect(res.data!['data'], {'n': 3});
      expect(calls, 3);
      expect(sleeps, hasLength(2));
      expect(sleeps[0], greaterThanOrEqualTo(const Duration(milliseconds: 100)));
      expect(sleeps[0], lessThan(const Duration(milliseconds: 131)));
      expect(sleeps[1], greaterThanOrEqualTo(const Duration(milliseconds: 200)));
    });

    test('gives up after maxRetries (4 attempts total)', () async {
      adapter.handler = (o) async => throwConnectionError(o);
      await expectLater(dio.get<dynamic>('/x'), throwsA(isA<DioException>()));
      expect(adapter.requests, hasLength(4));
    });

    test('never retries a plain POST (e.g. /auth/refresh — reuse detection)', () async {
      adapter.handler = (o) async => throwConnectionError(o);
      await expectLater(dio.post<dynamic>('/auth/refresh'), throwsA(isA<DioException>()));
      expect(adapter.requests, hasLength(1));
    });

    test('retries a keyed POST, re-sending the SAME Idempotency-Key', () async {
      var calls = 0;
      adapter.handler = (o) async {
        calls++;
        if (calls == 1) throwConnectionError(o);
        return ok(const {});
      };
      await dio.post<dynamic>('/users/me/consents', options: RequestFlags.createOptions());
      expect(adapter.requests, hasLength(2));
      expect(
        adapter.requests.map((r) => r.headers['Idempotency-Key']).toSet(),
        {'key-1'},
      );
    });

    test('retries a bare 503 but not 503 PROVIDER_BUDGET_EXCEEDED', () async {
      var calls = 0;
      adapter.handler = (o) async {
        calls++;
        return calls == 1 ? jsonBody('upstream down', 503) : ok(const {});
      };
      await dio.get<dynamic>('/x');
      expect(calls, 2);

      adapter.requests.clear();
      adapter.handler = (o) async => apiError(503, 'PROVIDER_BUDGET_EXCEEDED');
      await expectLater(dio.get<dynamic>('/y'), throwsA(isA<DioException>()));
      expect(adapter.requests, hasLength(1));
    });

    test('does not retry 4xx or opted-out requests', () async {
      adapter.handler = (o) async => apiError(400, 'VALIDATION_ERROR');
      await expectLater(dio.get<dynamic>('/x'), throwsA(isA<DioException>()));
      expect(adapter.requests, hasLength(1));

      adapter.requests.clear();
      adapter.handler = (o) async => throwConnectionError(o);
      await expectLater(
        dio.get<dynamic>('/y', options: Options(extra: const {RequestFlags.noRetry: true})),
        throwsA(isA<DioException>()),
      );
      expect(adapter.requests, hasLength(1));
    });
  });
}
