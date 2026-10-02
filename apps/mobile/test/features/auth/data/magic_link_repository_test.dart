// ignore_for_file: lines_longer_than_80_chars
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/data/magic_link_verifier_store.dart';
import 'package:lawbid/features/auth/domain/otp_verify_result.dart';

import '../../../helpers/fake_http_adapter.dart';

Map<String, dynamic> bodyOf(RequestOptions o) => o.data is String
    ? jsonDecode(o.data as String) as Map<String, dynamic>
    : o.data as Map<String, dynamic>;

class RecordingSession extends SessionController {
  final applied = <AuthTokensResult>[];

  @override
  SessionState? build() => null;

  @override
  Future<void> applyTokens(AuthTokensResult tokens) async =>
      applied.add(tokens);
}

const _tokens = {
  'accessToken': 'at',
  'refreshToken': 'rt',
  'accessTokenExpiresIn': 900,
  'isNewUser': false,
};

final _b64url43 = RegExp(r'^[A-Za-z0-9_-]{43}$');

/// Email magic link binding (security review 2026-09-27): the email code
/// request carries SHA-256(verifier), the verifier stays in secure storage,
/// and the link is redeemed with both token and verifier.
void main() {
  late FakeHttpAdapter adapter;
  late ProviderContainer c;
  late RecordingSession session;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    adapter = FakeHttpAdapter(
      (o) async =>
          o.path == '/auth/otp/request' ? ok({'sent': true}) : ok(_tokens),
    );
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = adapter;
    session = RecordingSession();
    c = ProviderContainer(
      overrides: [
        authApiClientProvider.overrideWithValue(AuthApiClient(dio)),
        deviceInfoProvider.overrideWithValue(
          const DeviceInfo(deviceId: 'd1', platform: 'ios'),
        ),
        sessionControllerProvider.overrideWith(() => session),
      ],
    );
    addTearDown(c.dispose);
  });

  test(
      'email code request sends linkChallenge = sha256(verifier) and stores the verifier',
      () async {
    await c
        .read(authRepositoryProvider)
        .requestOtp('ann@example.com', channel: 'email');

    final verifier = await c.read(magicLinkVerifierStoreProvider).read();
    expect(verifier, matches(_b64url43));
    final body = bodyOf(adapter.requests.single);
    expect(body['channel'], 'email');
    expect(body['identifier'], 'ann@example.com');
    final expected = base64Url
        .encode(sha256.convert(ascii.encode(verifier!)).bytes)
        .replaceAll('=', '');
    expect(body['linkChallenge'], expected);
    expect(body['linkChallenge'], matches(_b64url43));
    expect(MagicLinkVerifierStore.challengeFor(verifier), expected);
  });

  test('each email request overwrites the verifier', () async {
    final repo = c.read(authRepositoryProvider);
    await repo.requestOtp('ann@example.com', channel: 'email');
    final first = await c.read(magicLinkVerifierStoreProvider).read();
    await repo.requestOtp('ann@example.com', channel: 'email');
    final second = await c.read(magicLinkVerifierStoreProvider).read();
    expect(second, isNot(first));
    expect(
      bodyOf(adapter.requests.last)['linkChallenge'],
      MagicLinkVerifierStore.challengeFor(second!),
    );
  });

  test('phone request sends no challenge and stores nothing', () async {
    await c.read(authRepositoryProvider).requestOtp('+12025550123');
    expect(
      bodyOf(adapter.requests.single),
      {'channel': 'phone', 'identifier': '+12025550123'},
    );
    expect(await c.read(magicLinkVerifierStoreProvider).read(), isNull);
  });

  test(
      'verifyEmailLink posts token + verifier to /auth/otp/verify-link and applies the session',
      () async {
    final token = 'A' * 43;
    final verifier = 'v' * 43;
    final result = await c
        .read(authRepositoryProvider)
        .verifyEmailLink(token: token, verifier: verifier);

    final req = adapter.requests.single;
    expect(req.path, '/auth/otp/verify-link');
    expect(req.method, 'POST');
    expect(req.extra[RequestFlags.skipAuth], isTrue);
    expect(bodyOf(req), {
      'token': token,
      'verifier': verifier,
      'deviceInfo': {'deviceId': 'd1', 'platform': 'ios'},
    });
    expect(result, const OtpVerifyResult.success(isNewUser: false));
    expect(session.applied.single.refreshToken, 'rt');
  });

  test('verifyEmailLink maps 401 AUTH_OTP_INVALID to invalid', () async {
    adapter.handler = (o) async => apiError(401, 'AUTH_OTP_INVALID');
    final result = await c
        .read(authRepositoryProvider)
        .verifyEmailLink(token: 'A' * 43, verifier: 'v' * 43);
    expect(result, const OtpVerifyResult.invalid());
    expect(session.applied, isEmpty);
  });

  test('session clear (logout) forgets the verifier', () async {
    await c
        .read(authRepositoryProvider)
        .requestOtp('ann@example.com', channel: 'email');
    expect(await c.read(magicLinkVerifierStoreProvider).read(), isNotNull);
    await session.clear();
    expect(await c.read(magicLinkVerifierStoreProvider).read(), isNull);
  });
}
