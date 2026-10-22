import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/headers_interceptor.dart';
import 'package:lawbid/core/session/token_secure_store.dart';

/// Owner 2026-10-22 (audit #7): the website's refresh token is an HttpOnly
/// cookie; the app keeps only a marker and asks for cookie mode on /auth/*.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TokenSecureStore cookie marker', () {
    setUp(() => FlutterSecureStorage.setMockInitialValues({}));

    test('an empty token from the server is stored as the marker', () async {
      const store = TokenSecureStore();
      await store.writeRefreshToken('');
      final stored = await store.readRefreshToken();
      expect(stored, TokenSecureStore.cookieMarker);
      expect(TokenSecureStore.wireValue(stored!), '');
    });

    test('a real token (phones, demo sessions) is kept as is', () async {
      const store = TokenSecureStore();
      await store.writeRefreshToken('rt-123', isDemo: true);
      expect(await store.readRefreshToken(), 'rt-123');
      expect(TokenSecureStore.wireValue('rt-123'), 'rt-123');
      expect(await store.readRefreshTokenIsDemo(), isTrue);
    });

    test(
      'the parked real account can be the cookie (demo on the web)',
      () async {
        const store = TokenSecureStore();
        await store.writeRealRefreshToken('');
        expect(
          await store.readRealRefreshToken(),
          TokenSecureStore.cookieMarker,
        );
      },
    );
  });

  group('HeadersInterceptor.applyWebSession', () {
    RequestOptions opts(String path) =>
        RequestOptions(baseUrl: 'https://api.lawbid.dev/api/v1', path: path);

    test('web auth calls ask for cookie mode and send credentials', () {
      final o = opts('/auth/refresh');
      HeadersInterceptor.applyWebSession(o, isWeb: true);
      expect(o.headers[HeadersInterceptor.webSessionHeader], '1');
      expect(o.extra['withCredentials'], isTrue);
    });

    test('other web calls and every phone call stay cookie-free', () {
      final other = opts('/cases');
      HeadersInterceptor.applyWebSession(other, isWeb: true);
      expect(
        other.headers.containsKey(HeadersInterceptor.webSessionHeader),
        isFalse,
      );
      expect(other.extra.containsKey('withCredentials'), isFalse);

      final phone = opts('/auth/refresh');
      HeadersInterceptor.applyWebSession(phone, isWeb: false);
      expect(
        phone.headers.containsKey(HeadersInterceptor.webSessionHeader),
        isFalse,
      );
    });
  });
}
