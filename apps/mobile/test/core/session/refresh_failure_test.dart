import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/refresh_failure_policy.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/token_secure_store.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';

import '../../helpers/fake_http_adapter.dart';

/// S15-1 / S15-6: a refresh that fails for a reason that is not the
/// token's fault must never cost the user the session.
class _Store extends TokenSecureStore {
  _Store(this.token);

  String? token;
  bool demo = false;
  Object? readError;
  int failWrites = 0;
  int writeAttempts = 0;
  int clears = 0;

  @override
  Future<String?> readRefreshToken() async {
    final e = readError;
    // ignore: only_throw_errors
    if (e != null) throw e;
    return token;
  }

  @override
  Future<bool> readRefreshTokenIsDemo() async => demo;

  @override
  Future<void> writeRefreshToken(String t, {bool isDemo = false}) async {
    writeAttempts++;
    if (failWrites > 0) {
      failWrites--;
      throw PlatformException(code: 'keystore');
    }
    token = t;
  }

  @override
  Future<void> clear() async {
    clears++;
    token = null;
  }

  @override
  Future<String?> readRealRefreshToken() async => null;

  @override
  Future<void> writeRealRefreshToken(String token) async {}

  @override
  Future<void> clearRealRefreshToken() async {}
}

String _jwt() {
  String enc(Map<String, Object?> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${enc({'alg': 'none'})}.${enc({
        'sub': 'u1',
        'sid': 's1',
        'role': 'client',
        'verified': false,
        'subscriptionStatus': 'none',
        'exp': 4102444800,
      })}.sig';
}

ResponseBody _okTokens([String refresh = 'rt2']) => ok({
      'accessToken': _jwt(),
      'refreshToken': refresh,
      'accessTokenExpiresIn': 900,
      'isNewUser': false,
    });

void main() {
  late _Store store;
  late FakeHttpAdapter adapter;
  late ProviderContainer c;

  void setUpWith(
    Future<ResponseBody> Function(RequestOptions, int call) answer, {
    String? token = 'rt1',
  }) {
    store = _Store(token);
    var call = 0;
    adapter = FakeHttpAdapter((o) async => answer(o, call++));
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = adapter;
    c = ProviderContainer(
      overrides: [
        authApiClientProvider.overrideWithValue(AuthApiClient(dio)),
        deviceInfoProvider.overrideWithValue(
          const DeviceInfo(deviceId: 'd1', platform: 'ios'),
        ),
        tokenSecureStoreProvider.overrideWithValue(store),
        refreshRetryDelaysProvider
            .overrideWithValue(const [Duration.zero, Duration.zero]),
        tokenWriteRetryDelaysProvider.overrideWithValue(
          const [Duration.zero, Duration.zero, Duration.zero],
        ),
      ],
    );
    addTearDown(c.dispose);
  }

  SessionController session() => c.read(sessionControllerProvider.notifier);

  group('classifyRefreshFailure', () {
    ApiException e(int status, String code) => ApiException(
          code: code,
          message: code,
          statusCode: status,
        );

    test('definitive only for 401/403 with an auth code', () {
      for (final code in [
        'AUTH_REFRESH_INVALID',
        'AUTH_REFRESH_EXPIRED',
        'AUTH_REFRESH_REUSE_DETECTED',
        'AUTH_SESSION_REVOKED',
      ]) {
        expect(
          classifyRefreshFailure(e(401, code)),
          RefreshFailureKind.definitive,
          reason: code,
        );
      }
      expect(
        classifyRefreshFailure(e(403, 'AUTH_SESSION_REVOKED')),
        RefreshFailureKind.definitive,
      );
    });

    test('server trouble is transient', () {
      expect(
        classifyRefreshFailure(e(500, 'INTERNAL_ERROR')),
        RefreshFailureKind.transient,
      );
      expect(
        classifyRefreshFailure(e(429, 'RATE_LIMITED')),
        RefreshFailureKind.transient,
      );
      expect(
        classifyRefreshFailure(e(503, 'SERVER_BUSY')),
        RefreshFailureKind.transient,
      );
      expect(
        classifyRefreshFailure(e(408, 'TIMEOUT')),
        RefreshFailureKind.transient,
      );
      // Same code, other status: not an auth verdict either.
      expect(
        classifyRefreshFailure(e(500, 'AUTH_REFRESH_INVALID')),
        RefreshFailureKind.transient,
      );
    });

    test('network, captive portal and local errors keep the token', () {
      expect(
        classifyRefreshFailure(
          const ApiException(
            code: ApiException.networkErrorCode,
            message: 'x',
          ),
        ),
        RefreshFailureKind.network,
      );
      expect(
        classifyRefreshFailure(
          const ApiException(
            code: ApiException.captivePortalCode,
            message: 'x',
            statusCode: 200,
          ),
        ),
        RefreshFailureKind.network,
      );
      expect(
        classifyRefreshFailure(StateError('x')),
        RefreshFailureKind.unknown,
      );
      expect(
        classifyRefreshFailure(e(400, 'VALIDATION_ERROR')),
        RefreshFailureKind.unknown,
      );
    });
  });

  group('bootstrap', () {
    for (final (status, code) in [
      (500, 'INTERNAL_ERROR'),
      (429, 'RATE_LIMITED'),
      (503, 'SERVER_BUSY'),
    ]) {
      test('$status $code keeps the refresh token and goes offline', () async {
        setUpWith((o, _) async => apiError(status, code));
        expect(await session().bootstrap(), SessionBootstrapResult.offline);
        expect(store.token, 'rt1');
        expect(store.clears, 0);
        expect(c.read(sessionControllerProvider), isNull);
        // First try plus the two backoff retries.
        expect(adapter.requests, hasLength(3));
      });
    }

    test('a transient failure that clears on the retry signs in', () async {
      setUpWith(
        (o, call) async =>
            call == 0 ? apiError(500, 'INTERNAL_ERROR') : _okTokens(),
      );
      expect(await session().bootstrap(), SessionBootstrapResult.signedIn);
      expect(adapter.requests, hasLength(2));
      expect(store.token, 'rt2');
    });

    test('a network failure keeps the token, no repeats', () async {
      setUpWith((o, _) async => throwConnectionError(o));
      expect(await session().bootstrap(), SessionBootstrapResult.offline);
      expect(store.token, 'rt1');
      expect(adapter.requests, hasLength(1));
    });

    test('a captive portal page keeps the token and goes offline', () async {
      setUpWith(
        (o, _) async => ResponseBody.fromString(
          '<html>sign in</html>',
          200,
          headers: {
            Headers.contentTypeHeader: ['text/html'],
          },
        ),
      );
      expect(await session().bootstrap(), SessionBootstrapResult.offline);
      expect(store.token, 'rt1');
    });

    for (final (status, code) in [
      (401, 'AUTH_REFRESH_INVALID'),
      (401, 'AUTH_REFRESH_EXPIRED'),
      (401, 'AUTH_REFRESH_REUSE_DETECTED'),
      (403, 'AUTH_SESSION_REVOKED'),
    ]) {
      test('$status $code is a verdict: sign out and clear', () async {
        setUpWith((o, _) async => apiError(status, code));
        expect(await session().bootstrap(), SessionBootstrapResult.signedOut);
        expect(store.token, isNull);
        expect(store.clears, 1);
        expect(adapter.requests, hasLength(1));
      });
    }

    test('an unrelated 4xx signs out of the screen but keeps the token',
        () async {
      setUpWith((o, _) async => apiError(400, 'VALIDATION_ERROR'));
      expect(await session().bootstrap(), SessionBootstrapResult.signedOut);
      expect(store.token, 'rt1');
    });

    test('a rotation race: a newer stored token is not wiped', () async {
      setUpWith((o, _) async {
        // Another refresh finished meanwhile and stored its token.
        store.token = 'rt-newer';
        return apiError(401, 'AUTH_REFRESH_REUSE_DETECTED');
      });
      await session().bootstrap();
      expect(store.token, 'rt-newer');
      expect(store.clears, 0);
    });

    test('an unreadable keychain ends in offline, never a hung splash',
        () async {
      setUpWith((o, _) async => _okTokens());
      store.readError = PlatformException(code: 'errSecInteractionNotAllowed');
      expect(await session().bootstrap(), SessionBootstrapResult.offline);
      expect(adapter.requests, isEmpty);
    });
  });

  group('refreshAccessToken', () {
    test('a 500 throws but keeps session and token', () async {
      setUpWith(
        (o, call) async =>
            call == 0 ? _okTokens() : apiError(500, 'INTERNAL_ERROR'),
      );
      await session().bootstrap();
      expect(c.read(sessionControllerProvider), isNotNull);
      await expectLater(
        session().refreshAccessToken(),
        throwsA(isA<ApiException>()),
      );
      expect(c.read(sessionControllerProvider), isNotNull);
      expect(store.token, 'rt2');
    });

    test('a 401 verdict signs the session out', () async {
      setUpWith(
        (o, call) async =>
            call == 0 ? _okTokens() : apiError(401, 'AUTH_REFRESH_INVALID'),
      );
      await session().bootstrap();
      await expectLater(
        session().refreshAccessToken(),
        throwsA(isA<ApiException>()),
      );
      expect(c.read(sessionControllerProvider), isNull);
      expect(store.token, isNull);
    });
  });

  group('guarded token write (S15-6)', () {
    test('a write that fails twice is retried and succeeds', () async {
      setUpWith((o, _) async => _okTokens());
      store.failWrites = 2;
      await session().bootstrap();
      expect(store.token, 'rt2');
      expect(store.writeAttempts, 3);
      expect(session().hasUnsavedRefreshToken, isFalse);
    });

    test('a write that never works keeps the token in memory and uses it',
        () async {
      setUpWith((o, _) async => _okTokens());
      await session().bootstrap(); // store: rt2
      store.failWrites = 100;
      await session().refreshAccessToken(); // rotates to rt2 again
      expect(session().hasUnsavedRefreshToken, isTrue);
      // The next refresh sends the in-memory token, not the stale stored one.
      store.token = 'stale';
      await session().refreshAccessToken();
      final body = adapter.requests.last.data as Map;
      expect(body['refreshToken'], 'rt2');
      // Resume: the keystore works again.
      store.failWrites = 0;
      await session().flushPendingToken();
      expect(session().hasUnsavedRefreshToken, isFalse);
      expect(store.token, 'rt2');
    });
  });
}
