import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/app_check_interceptor.dart';
import 'package:lawbid/core/security/app_check.dart';

import '../../helpers/fake_http_adapter.dart';

/// Security research #5 (2026-10-22), B1 — docs/runbooks/APP_CHECK.md.
void main() {
  late FakeHttpAdapter adapter;
  late Dio dio;
  late List<bool> asked;
  String? token;

  Dio build({
    Future<String?> Function({bool forceRefresh})? getter,
    String? Function()? status,
  }) {
    adapter = FakeHttpAdapter((o) async => ok({'ok': true}));
    final d = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = adapter;
    d.interceptors.add(
      AppCheckInterceptor(
        token: getter ??
            ({bool forceRefresh = false}) async {
              asked.add(forceRefresh);
              return token;
            },
        status: status,
      ),
    );
    return d;
  }

  setUp(() {
    asked = [];
    token = 'tok-1';
    dio = build();
  });

  group('AppCheckInterceptor', () {
    test('puts the token on the six verified routes only', () async {
      await dio.post<dynamic>('/auth/otp/request', data: {'channel': 'phone'});
      await dio.post<dynamic>('/auth/password/reset/request');
      await dio.post<dynamic>('/auth/social');
      await dio.post<dynamic>('/auth/phone/status');
      await dio.post<dynamic>('/auth/password/login');
      await dio.post<dynamic>('/auth/otp/verify');

      for (final r in adapter.requests) {
        expect(r.headers[AppCheckInterceptor.header], 'tok-1', reason: r.path);
      }
      expect(asked, hasLength(6));
    });

    test('leaves every other request alone, including GETs there', () async {
      await dio.post<dynamic>('/auth/qr');
      await dio.post<dynamic>('/auth/refresh');
      await dio.get<dynamic>('/auth/phone/status');
      await dio.post<dynamic>('/cases');
      await dio.get<dynamic>('/users/me');

      for (final r in adapter.requests) {
        expect(
          r.headers.containsKey(AppCheckInterceptor.header),
          isFalse,
          reason: '${r.method} ${r.path}',
        );
      }
      expect(asked, isEmpty);
    });

    test('no token: the request goes out without the header', () async {
      token = null;
      final res = await dio.post<Map<String, dynamic>>('/auth/otp/request');
      expect(res.data!['data'], {'ok': true});
      expect(
        adapter.requests.single.headers.containsKey(AppCheckInterceptor.header),
        isFalse,
      );
    });

    test('a getter that throws never blocks sign-in', () async {
      dio = build(
        getter: ({bool forceRefresh = false}) => throw StateError('x'),
      );
      final res = await dio.post<Map<String, dynamic>>('/auth/otp/request');
      expect(res.data!['data'], {'ok': true});
      expect(
        adapter.requests.single.headers.containsKey(AppCheckInterceptor.header),
        isFalse,
      );
    });

    test(
        'DEVICE_ATTESTATION_REQUIRED surfaces as the «update the app» text '
        'and the next attempt asks for a fresh token', () async {
      adapter.handler =
          (o) async => apiError(403, ApiErrorCodes.deviceAttestationRequired);
      Object? thrown;
      try {
        await dio.post<dynamic>('/auth/otp/request');
      } on DioException catch (e) {
        thrown = ApiException.fromDioException(e);
      }
      final error = thrown! as ApiException;
      expect(error.code, ApiErrorCodes.deviceAttestationRequired);
      for (final t in const [StaticTranslatorEn(), StaticTranslatorRu()]) {
        final text = apiErrorText(t, error);
        expect(text, isNot(t.t('error.default.message')));
        expect(text, t.t('error.api.DEVICE_ATTESTATION_REQUIRED'));
      }

      adapter.handler = (o) async => ok({'ok': true});
      await dio.post<dynamic>('/auth/otp/request');
      await dio.post<dynamic>('/auth/otp/request');
      expect(asked, [false, true, false]);
    });

    // Item 13 (2026-11-25): limited-use tokens where the server may consume
    // them, and the payment starts.
    group('limited-use tokens', () {
      Dio withLimited(Future<String?> Function() limited) {
        adapter = FakeHttpAdapter((o) async => ok({'ok': true}));
        return Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
          ..httpClientAdapter = adapter
          ..interceptors.add(
            AppCheckInterceptor(
              token: ({bool forceRefresh = false}) async {
                asked.add(forceRefresh);
                return token;
              },
              limitedToken: limited,
            ),
          );
      }

      test('the SMS, reset, phone-status and payment routes get one', () async {
        final d = withLimited(() async => 'lim-1');
        await d.post<dynamic>('/auth/otp/request');
        await d.post<dynamic>('/auth/password/reset/request');
        await d.post<dynamic>('/auth/phone/status');
        await d.post<dynamic>('/client-plans/checkout');
        await d.post<dynamic>('/verification/client/checkout');
        await d.post<dynamic>('/stars/packs/p-1/buy');
        await d.post<dynamic>('/bid-packs/p-2/buy');
        for (final r in adapter.requests) {
          expect(
            r.headers[AppCheckInterceptor.header],
            'lim-1',
            reason: r.path,
          );
          expect(r.headers[AppCheckInterceptor.limitedHeader], '1');
        }
        expect(asked, isEmpty);
      });

      test('sign-in itself keeps the normal cached token', () async {
        final d = withLimited(() async => 'lim-1');
        await d.post<dynamic>('/auth/password/login');
        final h = adapter.requests.single.headers;
        expect(h[AppCheckInterceptor.header], 'tok-1');
        expect(h.containsKey(AppCheckInterceptor.limitedHeader), isFalse);
      });

      test('no limited-use token: the cached one goes, not marked', () async {
        final d = withLimited(() async => null);
        await d.post<dynamic>('/auth/otp/request');
        final h = adapter.requests.single.headers;
        expect(h[AppCheckInterceptor.header], 'tok-1');
        expect(h.containsKey(AppCheckInterceptor.limitedHeader), isFalse);
      });

      test('a payment route with a deeper path is not matched', () async {
        final d = withLimited(() async => 'lim-1');
        await d.post<dynamic>('/stars/packs/p-1/x/buy');
        expect(
          adapter.requests.single.headers.containsKey(
            AppCheckInterceptor.header,
          ),
          isFalse,
        );
      });
    });

    group('X-Firebase-AppCheck-Status (2026-11-08)', () {
      test('with a token: the token goes out, no status', () async {
        dio = build(status: () => 'off: should not be sent');
        await dio.post<dynamic>('/auth/otp/request');
        final h = adapter.requests.single.headers;
        expect(h[AppCheckInterceptor.header], 'tok-1');
        expect(h.containsKey(AppCheckInterceptor.statusHeader), isFalse);
      });

      test('no token: the reason goes out instead', () async {
        token = null;
        dio = build(status: () => 'error: unknown App attestation failed');
        await dio.post<dynamic>('/auth/phone/status');
        final h = adapter.requests.single.headers;
        expect(h.containsKey(AppCheckInterceptor.header), isFalse);
        expect(
          h[AppCheckInterceptor.statusHeader],
          'error: unknown App attestation failed',
        );
      });

      test('no token and no known reason: «none»', () async {
        token = null;
        dio = build(status: () => null);
        await dio.post<dynamic>('/auth/otp/request');
        expect(
          adapter.requests.single.headers[AppCheckInterceptor.statusHeader],
          'none',
        );
      });

      test('a throwing getter is reported by its type', () async {
        dio = build(
          getter: ({bool forceRefresh = false}) => throw StateError('x'),
          status: () => 'unused',
        );
        await dio.post<dynamic>('/auth/otp/request');
        expect(
          adapter.requests.single.headers[AppCheckInterceptor.statusHeader],
          'interceptor: StateError',
        );
      });

      test('no status source (the web): no status header at all', () async {
        token = null;
        await dio.post<dynamic>('/auth/otp/request');
        expect(
          adapter.requests.single.headers.containsKey(
            AppCheckInterceptor.statusHeader,
          ),
          isFalse,
        );
      });

      test('other routes never get it', () async {
        token = null;
        dio = build(status: () => 'off: x');
        await dio.post<dynamic>('/cases');
        expect(
          adapter.requests.single.headers.containsKey(
            AppCheckInterceptor.statusHeader,
          ),
          isFalse,
        );
      });

      test('appCheckStatus: one short ASCII line', () {
        expect(
          appCheckStatus(
            'error',
            FirebaseException(
              plugin: 'firebase_app_check',
              code: 'unknown',
              message: 'App attestation failed.\nHTTP 403 «denied»',
            ),
          ),
          'error: unknown App attestation failed. HTTP 403 denied',
        );
        expect(appCheckStatus('off', TimeoutException('t')), 'off: timeout');
        expect(appCheckStatus('error', 'x' * 500), hasLength(120));
      });
    });
  });
}
