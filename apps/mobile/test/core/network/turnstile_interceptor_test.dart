import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/turnstile_interceptor.dart';
import 'package:lawbid/core/security/turnstile.dart';

import '../../helpers/fake_http_adapter.dart';

/// 2026-10-24 (abuse batch D, item 4): the website's Turnstile token goes
/// on the costly anonymous auth routes, and only when a site key is known.
void main() {
  late FakeHttpAdapter adapter;
  late List<String> asked;
  String? siteKey;
  String? token;

  Dio build({Future<String?> Function(String key)? fake}) {
    adapter = FakeHttpAdapter((o) async => ok({'ok': true}));
    final d = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = adapter;
    d.interceptors.add(
      TurnstileInterceptor(
        siteKey: () => siteKey,
        token: fake ??
            (key) async {
              asked.add(key);
              return token;
            },
      ),
    );
    return d;
  }

  setUp(() {
    asked = [];
    siteKey = '0x4AAA';
    token = 'ts-1';
  });

  group('TurnstileInterceptor', () {
    test('puts X-Turnstile-Token on the verified routes only', () async {
      final dio = build();
      await dio.post<dynamic>('/auth/otp/request', data: {'channel': 'phone'});
      await dio.post<dynamic>('/auth/phone/status');
      // S14-13: the sign-in routes share the App Check route list.
      await dio.post<dynamic>('/auth/otp/verify');
      await dio.post<dynamic>('/auth/password/login');
      for (final r in adapter.requests) {
        expect(r.headers[TurnstileInterceptor.header], 'ts-1');
      }
      expect(asked, ['0x4AAA', '0x4AAA', '0x4AAA', '0x4AAA']);

      await dio.post<dynamic>('/auth/qr');
      await dio.get<dynamic>('/auth/phone/status');
      await dio.post<dynamic>('/cases');
      for (final r in adapter.requests.skip(4)) {
        expect(r.headers.containsKey(TurnstileInterceptor.header), isFalse);
      }
      expect(asked, hasLength(4));
    });

    test('does nothing without a site key (Turnstile off)', () async {
      siteKey = null;
      final dio = build();
      await dio.post<dynamic>('/auth/otp/request');
      siteKey = '';
      await dio.post<dynamic>('/auth/otp/request');
      expect(asked, isEmpty);
      for (final r in adapter.requests) {
        expect(r.headers.containsKey(TurnstileInterceptor.header), isFalse);
      }
    });

    test('no token or a failing provider never blocks the request', () async {
      token = null;
      var dio = build();
      await dio.post<dynamic>('/auth/otp/request');
      expect(
        adapter.requests.single.headers.containsKey(
          TurnstileInterceptor.header,
        ),
        isFalse,
      );

      dio = build(fake: (_) async => throw StateError('script blocked'));
      final res = await dio.post<Map<String, dynamic>>('/auth/otp/request');
      expect(res.data!['data'], {'ok': true});
      expect(
        adapter.requests.single.headers.containsKey(
          TurnstileInterceptor.header,
        ),
        isFalse,
      );
    });
  });

  group('turnstileSiteKeyFrom', () {
    test('reads the bootstrap key, blank means off', () {
      expect(
        turnstileSiteKeyFrom({'turnstile.site_key': ' 0x4AAA '}),
        '0x4AAA',
      );
      expect(turnstileSiteKeyFrom({'turnstile.site_key': ''}), isNull);
      expect(turnstileSiteKeyFrom({}), isNull);
    });
  });
}
