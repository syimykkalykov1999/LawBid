import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/captive_portal_interceptor.dart';
import 'package:lawbid/core/network/retry_interceptor.dart';
import 'package:lawbid/core/network/timeout_budget_interceptor.dart';

import '../../helpers/fake_http_adapter.dart';

ResponseBody _html(int status) => ResponseBody.fromString(
      '<html>Wi-Fi sign in</html>',
      status,
      headers: {
        Headers.contentTypeHeader: ['text/html; charset=utf-8'],
      },
    );

void main() {
  group('captive portal (S15-13)', () {
    Future<ApiException> failWith(int status) async {
      final adapter = FakeHttpAdapter((o) async => _html(status));
      final dio = Dio(BaseOptions(baseUrl: 'http://t/api'))
        ..httpClientAdapter = adapter
        ..interceptors.add(CaptivePortalInterceptor());
      try {
        await dio.get<dynamic>('/cases');
      } on DioException catch (e) {
        expect(RetryInterceptor.isRetryable(e), isFalse);
        return ApiException.fromDioException(e);
      }
      throw StateError('expected an error');
    }

    test('HTML 200 on a JSON route is a captive portal, a network failure',
        () async {
      final e = await failWith(200);
      expect(e.isCaptivePortal, isTrue);
      expect(e.isNetworkError, isTrue);
      expect(e.code, ApiException.captivePortalCode);
    });

    test('a 511 page is captive too', () async {
      expect((await failWith(511)).isCaptivePortal, isTrue);
    });

    test('a bare gateway 502 page is NOT captive', () async {
      final adapter = FakeHttpAdapter((o) async => _html(502));
      final dio = Dio(BaseOptions(baseUrl: 'http://t/api'))
        ..httpClientAdapter = adapter
        ..interceptors.add(CaptivePortalInterceptor());
      try {
        await dio.get<dynamic>('/cases');
        fail('expected an error');
      } on DioException catch (e) {
        final api = ApiException.fromDioException(e);
        expect(api.code, ApiException.networkErrorCode);
        expect(api.isCaptivePortal, isFalse);
      }
    });

    test('real JSON passes through untouched', () async {
      final adapter = FakeHttpAdapter((o) async => ok({'a': 1}));
      final dio = Dio(BaseOptions(baseUrl: 'http://t/api'))
        ..httpClientAdapter = adapter
        ..interceptors.add(CaptivePortalInterceptor());
      final r = await dio.get<dynamic>('/cases');
      expect((r.data as Map)['data'], {'a': 1});
    });
  });

  group('identical in-flight GETs (S15-12)', () {
    late Completer<void> gate;
    late FakeHttpAdapter adapter;

    Dio make({int status = 200}) {
      gate = Completer<void>();
      adapter = FakeHttpAdapter((o) async {
        await gate.future;
        final body = status == 200
            ? {'n': adapter.requests.length}
            : {
                'error': {'code': 'INTERNAL_ERROR', 'message': 'x'},
              };
        return ResponseBody.fromString(
          jsonEncode(body),
          status,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
            'etag': ['"v1"'],
          },
        );
      });
      return Dio(BaseOptions(baseUrl: 'http://t/api'))
        ..httpClientAdapter = adapter
        ..interceptors.add(HttpCacheInterceptor());
    }

    test('two widgets, one request, the same body', () async {
      final dio = make();
      final a = dio.get<dynamic>('/feed');
      final b = dio.get<dynamic>('/feed');
      await pumpEventQueue();
      gate.complete();
      final results = await Future.wait([a, b]);
      expect(adapter.requests, hasLength(1));
      expect(results[0].data, results[1].data);
      expect(results[1].extra['coalesced'], isTrue);
    });

    test('different URLs are not shared', () async {
      final dio = make();
      final a = dio.get<dynamic>('/feed', queryParameters: {'p': 1});
      final b = dio.get<dynamic>('/feed', queryParameters: {'p': 2});
      await pumpEventQueue();
      gate.complete();
      await Future.wait([a, b]);
      expect(adapter.requests, hasLength(2));
    });

    test('noCoalesce opts out', () async {
      final dio = make();
      final opt = Options(extra: {HttpCacheInterceptor.noCoalesceExtra: true});
      final a = dio.get<dynamic>('/feed', options: opt);
      final b = dio.get<dynamic>('/feed', options: opt);
      await pumpEventQueue();
      gate.complete();
      await Future.wait([a, b]);
      expect(adapter.requests, hasLength(2));
    });

    test('a failing leader is not shared: the follower asks for itself',
        () async {
      final dio = make(status: 500);
      final a =
          dio.get<dynamic>('/feed').then((_) => 'ok').catchError((_) => 'err');
      final b =
          dio.get<dynamic>('/feed').then((_) => 'ok').catchError((_) => 'err');
      await pumpEventQueue();
      gate.complete();
      expect(await Future.wait([a, b]), ['err', 'err']);
      expect(adapter.requests, hasLength(2));
    });

    test('after the answer a new GET is a new request', () async {
      final dio = make();
      gate.complete();
      await dio.get<dynamic>('/feed');
      await dio.get<dynamic>('/feed');
      // The second one is the conditional GET (If-None-Match), still a request.
      expect(adapter.requests, hasLength(2));
    });
  });

  group('time budget (S15-12)', () {
    tearDown(ClientTuning.reset);

    test('the start reads get the short timeout, others keep the default',
        () async {
      final adapter = FakeHttpAdapter((o) async => ok({}));
      final dio = Dio(
        BaseOptions(
          baseUrl: 'http://t/api',
          receiveTimeout: const Duration(seconds: 15),
        ),
      )
        ..httpClientAdapter = adapter
        ..interceptors.add(TimeoutBudgetInterceptor());
      await dio.get<dynamic>('/me/session');
      await dio.get<dynamic>('/cases');
      await dio.post<dynamic>('/me/session');
      expect(adapter.requests[0].receiveTimeout, const Duration(seconds: 8));
      expect(adapter.requests[1].receiveTimeout, const Duration(seconds: 15));
      expect(adapter.requests[2].receiveTimeout, const Duration(seconds: 15));
    });

    test('the server can tune it, within bounds', () {
      ClientTuning.apply({'client.fast_timeout_s': '1'});
      expect(ClientTuning.fastTimeout, const Duration(seconds: 3));
      ClientTuning.apply({'client.fast_timeout_s': '12'});
      expect(ClientTuning.fastTimeout, const Duration(seconds: 12));
    });
  });
}
