import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/auth_interceptor.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/network/retry_interceptor.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';

import '../../helpers/fake_http_adapter.dart';

/// A signed-in session whose `clear()` is only counted.
class _Session extends SessionController {
  int clears = 0;

  @override
  SessionState? build() => _state('demo-token', 's1');

  /// The real account signs in while a request of the old one is on the way.
  void signIn(String token) => state = _state(token, 's2');

  static SessionState _state(String token, String sid) => SessionState(
        accessToken: token,
        sub: 'me',
        role: 'client',
        sid: sid,
        verified: true,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2100),
      );

  @override
  Future<void> clear() async {
    clears++;
    state = null;
  }
}

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
      expect(
        adapter.requests[1].headers.containsKey('Idempotency-Key'),
        isFalse,
      );
      expect(
        adapter.requests[2].headers.containsKey('Idempotency-Key'),
        isFalse,
      );
    });

    test('keeps a caller-supplied key', () async {
      await dio.post<dynamic>(
        '/a',
        options: Options(
          extra: const {RequestFlags.createsResource: true},
          headers: {'idempotency-key': 'mine'},
        ),
      );
      expect(adapter.requests.single.headers['idempotency-key'], 'mine');
      expect(keySeq, 0);
    });

    // Owner 2026-10-22 (audit #4 §3): a queued reel publishes with its job
    // id as the key, so a repeat after a restart is the same post.
    test('uses the key given in extras', () async {
      await dio.post<dynamic>(
        '/a',
        options: Options(
          extra: const {
            RequestFlags.createsResource: true,
            RequestFlags.idempotencyKey: 'job-1',
          },
        ),
      );
      expect(adapter.requests.single.headers['Idempotency-Key'], 'job-1');
      expect(keySeq, 0);
    });
  });

  group('RetryInterceptor', () {
    test('retries an idempotent GET on network errors with exponential backoff',
        () async {
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
      expect(
        sleeps[0],
        greaterThanOrEqualTo(const Duration(milliseconds: 100)),
      );
      expect(sleeps[0], lessThan(const Duration(milliseconds: 131)));
      expect(
        sleeps[1],
        greaterThanOrEqualTo(const Duration(milliseconds: 200)),
      );
    });

    test('gives up after maxRetries (3 attempts total)', () async {
      adapter.handler = (o) async => throwConnectionError(o);
      await expectLater(dio.get<dynamic>('/x'), throwsA(isA<DioException>()));
      expect(adapter.requests, hasLength(3));
    });

    test('defaults to 2 retries starting at 1 s', () {
      final r = RetryInterceptor(Dio());
      expect(r.maxRetries, 2);
      expect(r.baseDelay, const Duration(seconds: 1));
    });

    test('waits for Retry-After (seconds), capped at 10 s', () async {
      ResponseBody busy(String retryAfter) => ResponseBody.fromString(
            '"busy"',
            503,
            headers: {
              Headers.contentTypeHeader: [Headers.jsonContentType],
              'retry-after': [retryAfter],
            },
          );
      var calls = 0;
      adapter.handler = (o) async {
        calls++;
        if (calls == 1) return busy('3');
        if (calls == 2) return busy('120');
        return ok(const {});
      };
      await dio.get<dynamic>('/x');
      expect(calls, 3);
      expect(sleeps, [const Duration(seconds: 3), const Duration(seconds: 10)]);
    });

    test('never retries a plain POST (e.g. /auth/refresh — reuse detection)',
        () async {
      adapter.handler = (o) async => throwConnectionError(o);
      await expectLater(
        dio.post<dynamic>('/auth/refresh'),
        throwsA(isA<DioException>()),
      );
      expect(adapter.requests, hasLength(1));
    });

    test('retries a keyed POST, re-sending the SAME Idempotency-Key', () async {
      var calls = 0;
      adapter.handler = (o) async {
        calls++;
        if (calls == 1) throwConnectionError(o);
        return ok(const {});
      };
      await dio.post<dynamic>(
        '/users/me/consents',
        options: RequestFlags.createOptions(),
      );
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

    test('retries 503 SERVER_BUSY (the server sheds load, come back)',
        () async {
      var calls = 0;
      adapter.handler = (o) async {
        calls++;
        return calls == 1 ? apiError(503, 'SERVER_BUSY') : ok(const {});
      };
      await dio.get<dynamic>('/x');
      expect(calls, 2);
    });

    test('does not retry 4xx or opted-out requests', () async {
      adapter.handler = (o) async => apiError(400, 'VALIDATION_ERROR');
      await expectLater(dio.get<dynamic>('/x'), throwsA(isA<DioException>()));
      expect(adapter.requests, hasLength(1));

      adapter.requests.clear();
      adapter.handler = (o) async => throwConnectionError(o);
      await expectLater(
        dio.get<dynamic>(
          '/y',
          options: Options(extra: const {RequestFlags.noRetry: true}),
        ),
        throwsA(isA<DioException>()),
      );
      expect(adapter.requests, hasLength(1));
    });
  });

  group('AuthInterceptor (CL1, 17.11)', () {
    late _Session session;
    late Dio authDio;

    setUp(() {
      session = _Session();
      final c = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        ],
      );
      addTearDown(c.dispose);
      final dioP = Provider<Dio>((ref) {
        final d = Dio(BaseOptions(baseUrl: 'http://test'))
          ..httpClientAdapter = FakeHttpAdapter(
            (o) async => apiError(401, 'AUTH_SESSION_REVOKED'),
          );
        d.interceptors.add(AuthInterceptor(ref, d));
        return d;
      });
      c.read(sessionControllerProvider);
      authDio = c.read(dioP);
    });

    for (final code in ['AUTH_SESSION_REVOKED', 'AUTH_SIGNED_IN_ELSEWHERE']) {
      test(
          'a late $code for a request sent with an OLD token (e.g. the demo '
          'session) keeps the new session', () async {
        (authDio.httpClientAdapter as FakeHttpAdapter).handler = (o) async {
          expect(o.headers['Authorization'], 'Bearer demo-token');
          session.signIn('real-token');
          return apiError(401, code);
        };
        await expectLater(
          authDio.get<dynamic>('/me'),
          throwsA(isA<DioException>()),
        );
        expect(session.clears, 0);
        expect(session.state?.accessToken, 'real-token');
      });

      test('$code for the CURRENT token still signs out', () async {
        (authDio.httpClientAdapter as FakeHttpAdapter).handler =
            (o) async => apiError(401, code);
        await expectLater(
          authDio.get<dynamic>('/me'),
          throwsA(isA<DioException>()),
        );
        expect(session.clears, 1);
        expect(session.state, isNull);
      });
    }
  });
}
