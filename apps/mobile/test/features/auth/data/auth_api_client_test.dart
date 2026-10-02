import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../../helpers/fake_http_adapter.dart';

Map<String, dynamic> bodyOf(RequestOptions o) => o.data is String
    ? jsonDecode(o.data as String) as Map<String, dynamic>
    : o.data as Map<String, dynamic>;

const tokens = {
  'accessToken': 'at',
  'refreshToken': 'rt',
  'accessTokenExpiresIn': 900,
  'isNewUser': true,
};

/// AuthApiClient runs on the generated `package:lawbid_api` client with the
/// app's own Dio: same paths/bodies/flags as the hand-written client it
/// replaced, typed envelopes, and every failure as an ApiException.
void main() {
  late FakeHttpAdapter adapter;
  late AuthApiClient client;

  setUp(() {
    adapter = FakeHttpAdapter((o) async => ok(tokens));
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = adapter
      ..interceptors.add(IdempotencyInterceptor(keyFactory: () => 'k'));
    client = AuthApiClient(dio);
  });

  test('verifyOtp: body from the generated DTO, skipAuth, typed tokens',
      () async {
    final result = await client.verifyOtp(
      channel: 'phone',
      identifier: '+12025550123',
      code: '123456',
      deviceInfo: const DeviceInfo(deviceId: 'd1', platform: 'ios'),
    );
    final req = adapter.requests.single;
    expect(req.method, 'POST');
    expect(req.uri.toString(), 'http://test/api/v1/auth/otp/verify');
    expect(req.extra[RequestFlags.skipAuth], isTrue);
    expect(bodyOf(req), {
      'channel': 'phone',
      'identifier': '+12025550123',
      'code': '123456',
      // Unset optional fields are omitted, never sent as null.
      'deviceInfo': {'deviceId': 'd1', 'platform': 'ios'},
    });
    expect(result.accessToken, 'at');
    expect(result.accessTokenExpiresIn, 900);
    expect(result.isNewUser, isTrue);
  });

  test('requestOtp and refresh skip the bearer token', () async {
    adapter.handler = (o) async =>
        o.path == '/auth/otp/request' ? ok({'sent': true}) : ok(tokens);
    await client.requestOtp(channel: 'email', identifier: 'a@b.co');
    await client.refresh(refreshToken: 'old');
    expect(
      adapter.requests.map((r) => r.extra[RequestFlags.skipAuth]),
      [true, true],
    );
    expect(
      bodyOf(adapter.requests[0]),
      {'channel': 'email', 'identifier': 'a@b.co'},
    );
    expect(bodyOf(adapter.requests[1]), {'refreshToken': 'old'});
  });

  test('logout needs the bearer token (no skipAuth)', () async {
    adapter.handler = (o) async => ok({'loggedOut': true});
    await client.logout();
    expect(adapter.requests.single.path, '/auth/logout');
    expect(adapter.requests.single.extra[RequestFlags.skipAuth], isNull);
  });

  test('reauth always sends method=otp and returns the token', () async {
    adapter.handler = (o) async => ok({'reauthToken': 'rt-1'});
    final token = await client.reauth(identifier: 'a@b.co', code: '654321');
    expect(token, 'rt-1');
    expect(
      bodyOf(adapter.requests.single),
      {'method': 'otp', 'identifier': 'a@b.co', 'code': '654321'},
    );
  });

  test('deleteAccount sends X-Reauth-Token', () async {
    adapter.handler = (o) async => ok({'deletionPending': true});
    await client.deleteAccount(reauthToken: 'rt-2');
    final req = adapter.requests.single;
    expect(req.method, 'DELETE');
    expect(req.path, '/users/me');
    expect(req.headers['X-Reauth-Token'], 'rt-2');
  });

  test('listSessions maps SessionDto rows (chain id, ISO timestamps)',
      () async {
    adapter.handler = (o) async => ok([
          {
            'sessionId': 'chain-1',
            'deviceId': null,
            'deviceName': 'iPhone',
            'platform': 'ios',
            'appVersion': '1.0.0',
            'lastUsedAt': null,
            'createdAt': '2026-09-01T10:00:00.000Z',
            'isCurrent': true,
          },
        ]);
    final sessions = await client.listSessions();
    expect(sessions.single.sessionId, 'chain-1');
    expect(sessions.single.createdAt, '2026-09-01T10:00:00.000Z');
    expect(sessions.single.lastUsedAt, isNull);
    expect(sessions.single.isCurrent, isTrue);
  });

  test('an error envelope becomes ApiException(code, details)', () async {
    adapter.handler = (o) async =>
        apiError(401, 'AUTH_REFRESH_REUSE_DETECTED', {'hint': 'x'});
    await expectLater(
      client.refresh(refreshToken: 'stolen'),
      throwsA(
        isA<ApiException>()
            .having(
              (e) => e.code,
              'code',
              ApiErrorCodes.authRefreshReuseDetected,
            )
            .having((e) => e.statusCode, 'status', 401),
      ),
    );
  });

  test('a 2xx body outside the contract is NETWORK_ERROR, not a crash',
      () async {
    adapter.handler = (o) async => ok({'accessToken': 42});
    await expectLater(
      client.verifyOtp(
        channel: 'phone',
        identifier: '+12025550123',
        code: '123456',
      ),
      throwsA(
        isA<ApiException>().having((e) => e.isNetworkError, 'network', isTrue),
      ),
    );
  });

  test('socialLogin posts the generated SocialLoginDto', () async {
    await client.socialLogin(
      const api.SocialLoginDto(
        provider: api.SocialLoginDtoProvider.apple,
        idToken: 'id',
        nonce: 'n',
        firstName: 'Ann',
      ),
    );
    final req = adapter.requests.single;
    expect(req.path, '/auth/social');
    expect(req.extra[RequestFlags.skipAuth], isTrue);
    expect(bodyOf(req), {
      'provider': 'apple',
      'idToken': 'id',
      'nonce': 'n',
      'firstName': 'Ann',
    });
  });
}
