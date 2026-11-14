import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/auth_interceptor.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/token_secure_store.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';

import '../../helpers/fake_http_adapter.dart';

/// Perf batch 4 (row 127): the signed-in cold start opens from the phone's
/// copy (the last claims, bound to the stored refresh token) and refreshes
/// the token behind it; requests wait for that refresh.
class _Store extends TokenSecureStore {
  _Store(this.token);

  String? token;
  bool demo = false;
  String? hint;
  int hintWrites = 0;

  @override
  Future<String?> readRefreshToken() async => token;

  @override
  Future<bool> readRefreshTokenIsDemo() async => demo;

  @override
  Future<void> writeRefreshToken(String t, {bool isDemo = false}) async {
    token = t;
    demo = isDemo;
  }

  @override
  Future<String?> readSessionHint() async => hint;

  @override
  Future<void> writeSessionHint(String json) async {
    hintWrites++;
    hint = json;
  }

  @override
  Future<void> clear() async {
    token = null;
    hint = null;
  }

  @override
  Future<String?> readRealRefreshToken() async => null;

  @override
  Future<void> writeRealRefreshToken(String token) async {}

  @override
  Future<void> clearRealRefreshToken() async {}
}

String _jwt({String sub = 'u1'}) {
  String enc(Map<String, Object?> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${enc({'alg': 'none'})}.${enc({
        'sub': sub,
        'sid': 's1',
        'role': 'client',
        'verified': true,
        'subscriptionStatus': 'none',
      })}.sig';
}

AuthTokensResult _tokens(String refresh) => AuthTokensResult(
      accessToken: _jwt(),
      refreshToken: refresh,
      accessTokenExpiresIn: 900,
      isNewUser: false,
    );

void main() {
  late _Store store;
  late FakeHttpAdapter authWire;
  late FakeHttpAdapter apiWire;
  var refreshes = 0;
  late Future<ResponseBody> Function(RequestOptions) refreshAnswer;

  setUp(() {
    store = _Store('rt1');
    refreshes = 0;
    var rotation = 1;
    refreshAnswer = (o) async => ok({
          'accessToken': _jwt(),
          'refreshToken': 'rt${++rotation}',
          'accessTokenExpiresIn': 900,
          'isNewUser': false,
        });
    authWire = FakeHttpAdapter((o) {
      refreshes++;
      return refreshAnswer(o);
    });
    apiWire = FakeHttpAdapter((o) async => ok({'fine': true}));
  });

  final apiDio = Provider<Dio>((ref) {
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'));
    dio.interceptors.add(AuthInterceptor(ref, dio));
    return dio;
  });

  /// One app process: a new container over the same keychain.
  ProviderContainer make() {
    final authDio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = authWire;
    final c = ProviderContainer(
      overrides: [
        authApiClientProvider.overrideWithValue(AuthApiClient(authDio)),
        deviceInfoProvider.overrideWithValue(
          const DeviceInfo(deviceId: 'd1', platform: 'ios'),
        ),
        tokenSecureStoreProvider.overrideWithValue(store),
        refreshRetryDelaysProvider
            .overrideWithValue(const [Duration.zero, Duration.zero]),
      ],
    );
    addTearDown(c.dispose);
    c.read(apiDio).httpClientAdapter = apiWire;
    return c;
  }

  SessionController session(ProviderContainer c) =>
      c.read(sessionControllerProvider.notifier);

  /// A signed-in run wrote the claims; then the app is opened again.
  Future<ProviderContainer> coldStart() async {
    await session(make()).applyTokens(_tokens('rt1'));
    await Future<void>.delayed(Duration.zero);
    return make();
  }

  /// A cold start that opened from the copy.
  Future<ProviderContainer> openCold() async {
    final c = await coldStart();
    session(c).openCached((await session(c).cachedSession())!);
    expect(c.read(sessionControllerProvider)!.awaitsRefresh, isTrue);
    return c;
  }

  test('claims are written once per change, bound to the token', () async {
    final c = make();
    await session(c).applyTokens(_tokens('rt1'));
    await session(c).applyTokens(_tokens('rt1'));
    await Future<void>.delayed(Duration.zero);
    expect(store.hintWrites, 1);
    final hint = jsonDecode(store.hint!) as Map<String, dynamic>;
    expect(hint['sub'], 'u1');
    expect(hint.containsKey('accessToken'), isFalse);
    expect(store.hint, isNot(contains('rt1')), reason: 'no token in it');
    // A rotation (new refresh token, same claims) re-binds the hint.
    await session(c).applyTokens(_tokens('rt9'));
    await Future<void>.delayed(Duration.zero);
    expect(store.hintWrites, 2);
  });

  group('cachedSession', () {
    test('answers the last claims with no token and no request', () async {
      final c = await coldStart();
      final cached = await session(c).cachedSession();
      expect(cached, isNotNull);
      expect(cached!.sub, 'u1');
      expect(cached.verified, isTrue);
      expect(cached.awaitsRefresh, isTrue);
      expect(c.read(sessionControllerProvider), isNull, reason: 'sets nothing');
      expect(refreshes, 0);
    });

    test('a hint of another token opens nothing', () async {
      final c = await coldStart();
      store.token = 'rt-of-someone-else';
      expect(await session(c).cachedSession(), isNull);
    });

    test('a demo flag that disagrees opens nothing', () async {
      final c = await coldStart();
      store.demo = true;
      expect(await session(c).cachedSession(), isNull);
    });

    test('the website (cookie session) never opens from the copy', () async {
      await session(make()).applyTokens(_tokens(''));
      await Future<void>.delayed(Duration.zero);
      expect(store.hint, isNull);
    });
  });

  group('revalidate', () {
    test('success: a real token replaces the cached session', () async {
      final c = await openCold();
      expect(await session(c).revalidate(), SessionBootstrapResult.signedIn);
      final s = c.read(sessionControllerProvider)!;
      expect(s.awaitsRefresh, isFalse);
      expect(s.sub, 'u1');
      expect(refreshes, 1);
    });

    for (final (status, code) in [
      (401, 'AUTH_REFRESH_EXPIRED'),
      (401, 'AUTH_REFRESH_REUSE_DETECTED'),
      (403, 'AUTH_SESSION_REVOKED'),
    ]) {
      test('$status $code: signed out, token and claims cleared', () async {
        final c = await openCold();
        refreshAnswer = (o) async => apiError(status, code);
        expect(
          await session(c).revalidate(),
          SessionBootstrapResult.signedOut,
        );
        expect(c.read(sessionControllerProvider), isNull);
        expect(store.token, isNull);
        expect(store.hint, isNull);
      });
    }

    test('offline: the cached session and the token stay', () async {
      final c = await openCold();
      refreshAnswer = (o) async => throwConnectionError(o);
      expect(await session(c).revalidate(), SessionBootstrapResult.offline);
      expect(c.read(sessionControllerProvider)?.awaitsRefresh, isTrue);
      expect(store.token, 'rt1');
    });
  });

  group('AuthInterceptor with a cached session', () {
    test('requests wait for the one refresh, then carry its token', () async {
      final c = await openCold();
      final api = c.read(apiDio);
      final gate = Completer<void>();
      final answer = refreshAnswer;
      refreshAnswer = (o) async {
        await gate.future;
        return answer(o);
      };
      final a = api.get<dynamic>('/cases');
      final b = api.get<dynamic>('/chats');
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(apiWire.requests, isEmpty, reason: 'nothing sent with no token');
      gate.complete();
      await Future.wait([a, b]);
      expect(refreshes, 1, reason: 'single-flight');
      expect(apiWire.requests, hasLength(2));
      for (final r in apiWire.requests) {
        expect(r.headers['Authorization'], 'Bearer ${_jwt()}');
      }
    });

    test('offline: the request fails as a network error, no repeat refresh',
        () async {
      final c = await openCold();
      final api = c.read(apiDio);
      refreshAnswer = (o) async => throwConnectionError(o);
      await expectLater(
        api.get<dynamic>('/cases'),
        throwsA(
          isA<DioException>().having(
            (e) => e.type,
            'type',
            DioExceptionType.connectionError,
          ),
        ),
      );
      await expectLater(
        api.get<dynamic>('/chats'),
        throwsA(isA<DioException>()),
      );
      expect(apiWire.requests, isEmpty);
      expect(refreshes, 1, reason: 'within the cooldown');
      expect(c.read(sessionControllerProvider)?.awaitsRefresh, isTrue);
    });

    test('revoked while waiting: the request goes out as a guest', () async {
      final c = await openCold();
      refreshAnswer = (o) async => apiError(401, 'AUTH_REFRESH_EXPIRED');
      await c.read(apiDio).get<dynamic>('/feed');
      expect(c.read(sessionControllerProvider), isNull);
      expect(apiWire.requests.single.headers['Authorization'], isNull);
    });
  });
}
