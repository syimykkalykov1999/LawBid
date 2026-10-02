import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/connectivity/reachability.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';

void main() {
  group('ReachabilityInterceptor', () {
    late ReachabilitySignal signal;
    late Dio dio;
    late FakeHttpAdapter adapter;
    late List<bool> events;

    setUp(() {
      signal = ReachabilitySignal();
      events = [];
      signal.changes.listen(events.add);
      adapter = FakeHttpAdapter((o) async => ok({'x': 1}));
      dio = Dio(BaseOptions(baseUrl: 'http://api.test/api/v1'))
        ..httpClientAdapter = adapter
        ..interceptors.add(ReachabilityInterceptor(() => signal));
    });

    tearDown(() => signal.dispose());

    Future<void> send() async {
      try {
        await dio.get<Object?>('/x');
      } on DioException {
        // The interceptor must pass every error through untouched.
      }
    }

    test('a successful response marks the API reachable', () async {
      await send();
      expect(signal.lastKnown, isTrue);
    });

    test('an error envelope (4xx/5xx) still proves reachability', () async {
      signal.markUnreachable();
      adapter.handler = (o) async => apiError(503, 'SERVICE_UNAVAILABLE');
      await send();
      expect(signal.lastKnown, isTrue);
      expect(events, [false, true]);
    });

    for (final type in [
      DioExceptionType.connectionError,
      DioExceptionType.connectionTimeout,
      DioExceptionType.sendTimeout,
    ]) {
      test('$type marks the API unreachable', () async {
        adapter.handler =
            (o) async => throw DioException(requestOptions: o, type: type);
        await send();
        expect(signal.lastKnown, isFalse);
      });
    }

    for (final type in [
      DioExceptionType.receiveTimeout,
      DioExceptionType.cancel,
      DioExceptionType.badCertificate,
      DioExceptionType.unknown,
    ]) {
      test('$type is not treated as offline', () async {
        adapter.handler =
            (o) async => throw DioException(requestOptions: o, type: type);
        await send();
        expect(signal.lastKnown, isNull);
      });
    }

    test('errors are re-thrown to the caller unchanged', () async {
      adapter.handler = (o) async => throwConnectionError(o);
      expect(
        () => dio.get<Object?>('/x'),
        throwsA(
          isA<DioException>().having(
            (e) => e.type,
            'type',
            DioExceptionType.connectionError,
          ),
        ),
      );
    });

    test('the signal only emits on change', () async {
      await send();
      await send();
      await send();
      expect(events, [true]);
    });
  });

  group('app wiring', () {
    // HeadersInterceptor needs the local KV store (device id).
    Future<ProviderContainer> appContainer() async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final container = ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      );
      addTearDown(container.dispose);
      return container;
    }

    test('dioProvider feeds reachabilitySignalProvider from real traffic',
        () async {
      final container = await appContainer();
      final dio = container.read(dioProvider)
        ..httpClientAdapter = FakeHttpAdapter(throwConnectionError);
      await expectLater(
        dio.get<Object?>(
          '/auth/sessions',
          options: Options(extra: const {RequestFlags.noRetry: true}),
        ),
        throwsA(isA<DioException>()),
      );
      expect(container.read(reachabilitySignalProvider).lastKnown, isFalse);
    });

    test('the probe hits /health/live outside /api/v1, unauthenticated',
        () async {
      final container = await appContainer();
      final adapter = FakeHttpAdapter((o) async => jsonBody({'status': 'ok'}));
      container.read(dioProvider).httpClientAdapter = adapter;
      final probe = container.read(reachabilityProbeProvider);

      expect(await probe(), isTrue);
      final request = adapter.requests.single;
      expect(request.uri.path, '/health/live');
      expect(request.headers.containsKey('Authorization'), isFalse);
      expect(request.extra[RequestFlags.noRetry], isTrue);
    });

    test(
        'the probe answers true for any HTTP status, false on transport '
        'failure', () async {
      final container = await appContainer();
      final adapter = FakeHttpAdapter((o) async => jsonBody({}, 503));
      container.read(dioProvider).httpClientAdapter = adapter;
      final probe = container.read(reachabilityProbeProvider);
      expect(await probe(), isTrue);
      adapter.handler = throwConnectionError;
      expect(await probe(), isFalse);
    });
  });
}
