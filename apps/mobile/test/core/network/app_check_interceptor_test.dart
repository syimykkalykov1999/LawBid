import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/app_check_interceptor.dart';

import '../../helpers/fake_http_adapter.dart';

/// Security research #5 (2026-10-22), B1 — docs/runbooks/APP_CHECK.md.
void main() {
  late FakeHttpAdapter adapter;
  late Dio dio;
  late List<bool> asked;
  String? token;

  Dio build({Future<String?> Function({bool forceRefresh})? getter}) {
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
    test('puts the token on the four verified routes only', () async {
      await dio.post<dynamic>('/auth/otp/request', data: {'channel': 'phone'});
      await dio.post<dynamic>('/auth/password/reset/request');
      await dio.post<dynamic>('/auth/social');
      await dio.post<dynamic>('/auth/phone/status');

      for (final r in adapter.requests) {
        expect(r.headers[AppCheckInterceptor.header], 'tok-1', reason: r.path);
      }
      expect(asked, hasLength(4));
    });

    test('leaves every other request alone, including GETs there', () async {
      await dio.post<dynamic>('/auth/otp/verify');
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
      dio =
          build(getter: ({bool forceRefresh = false}) => throw StateError('x'));
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
  });
}
