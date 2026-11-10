import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/reachability.dart';
import 'package:lawbid/core/realtime/realtime_timings.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/domain/otp_verify_result.dart';
import 'package:lawbid/features/auth/domain/password_auth_result.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_form_widgets.dart';

import '../../../helpers/fake_http_adapter.dart';

class _Session extends SessionController {
  _Session({this.throwOnApply = false});
  final bool throwOnApply;

  @override
  SessionState? build() => null;

  @override
  Future<void> applyTokens(AuthTokensResult tokens) async {
    if (throwOnApply) throw StateError('listener failed');
  }
}

const _tokens = {
  'accessToken': 'at',
  'refreshToken': 'rt',
  'accessTokenExpiresIn': 900,
  'isNewUser': false,
};

/// Owner 2026-11-03 (Samsung): password sign-in showed «No connection» while
/// the network was fine. Only a call that never got an answer may say so.
void main() {
  Future<PasswordAuthResult> signIn(
    FakeHandler handler, {
    bool throwOnApply = false,
  }) async {
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = FakeHttpAdapter(handler);
    final c = ProviderContainer(
      overrides: [
        authApiClientProvider.overrideWithValue(AuthApiClient(dio)),
        deviceInfoProvider.overrideWithValue(
          const DeviceInfo(deviceId: 'd1', platform: 'android'),
        ),
        sessionControllerProvider.overrideWith(
          () => _Session(throwOnApply: throwOnApply),
        ),
      ],
    );
    addTearDown(c.dispose);
    return c.read(authRepositoryProvider).signInWithPassword(
          identifier: '+12025550123',
          password: 'secret-pass',
        );
  }

  Future<OtpVerifyResult> assistant(
    FakeHandler handler, {
    bool throwOnApply = false,
  }) async {
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = FakeHttpAdapter(handler);
    final c = ProviderContainer(
      overrides: [
        authApiClientProvider.overrideWithValue(AuthApiClient(dio)),
        deviceInfoProvider.overrideWithValue(
          const DeviceInfo(deviceId: 'd1', platform: 'android'),
        ),
        sessionControllerProvider
            .overrideWith(() => _Session(throwOnApply: throwOnApply)),
      ],
    );
    addTearDown(c.dispose);
    return c.read(authRepositoryProvider).signInWithAssistantCode('ABCD-1234');
  }

  test('assistant: unknown server code is failed, offline stays offline',
      () async {
    expect(
      await assistant((_) async => apiError(400, 'VALIDATION_ERROR')),
      const OtpVerifyResult.failed(),
    );
    expect(
      await assistant(
        (o) async => throw DioException.connectionError(
          requestOptions: o,
          reason: 'down',
        ),
      ),
      const OtpVerifyResult.networkError(),
    );
    expect(
      await assistant((_) async => ok(_tokens), throwOnApply: true),
      const OtpVerifyResult.failed(),
    );
    expect(
      await assistant((_) async => ok(_tokens)),
      const OtpVerifyResult.success(isNewUser: false),
    );
  });

  test(
      'sweep C-c13 D5: a blocked / deleted account signing in by code is '
      '«account unavailable», not «No connection»', () async {
    for (final code in ['ACCOUNT_SUSPENDED', 'ACCOUNT_DELETED']) {
      expect(
        await assistant((_) async => apiError(403, code)),
        const OtpVerifyResult.unavailable(),
        reason: code,
      );
    }
  });

  test('wrong password -> invalidCredentials', () async {
    final r = await signIn(
      (_) async => apiError(401, 'AUTH_INVALID_CREDENTIALS'),
    );
    expect(r.status, PasswordAuthStatus.invalidCredentials);
  });

  test(
    'a server code the screen has no text for is NOT «No connection»',
    () async {
      final r = await signIn((_) async => apiError(400, 'VALIDATION_ERROR'));
      expect(r.status, PasswordAuthStatus.failed);
      expect(passwordErrorKey(r.status), 'error.default.message');
    },
  );

  test('a call with no answer at all stays «No connection»', () async {
    final r = await signIn(
      (o) async =>
          throw DioException.connectionError(requestOptions: o, reason: 'down'),
    );
    expect(r.status, PasswordAuthStatus.networkError);
  });

  test(
    'tokens received but the session cannot be stored -> failed, not offline',
    () async {
      final r = await signIn((_) async => ok(_tokens), throwOnApply: true);
      expect(r.status, PasswordAuthStatus.failed);
    },
  );

  test('success applies the session', () async {
    final r = await signIn((_) async => ok(_tokens));
    expect(r.isSuccess, isTrue);
  });

  test('a stale «offline» flag does not stop the sign-in from being sent',
      () async {
    final signal = ReachabilitySignal(
      timings: () =>
          const RealtimeTimings(offlineFailures: 1, offlineSeconds: 0),
    );
    addTearDown(signal.dispose);
    signal.markUnreachable();
    expect(signal.lastKnown, isFalse);

    final adapter = FakeHttpAdapter((_) async => ok(_tokens));
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = adapter
      ..interceptors.add(ReachabilityInterceptor(() => signal));
    final c = ProviderContainer(
      overrides: [
        authApiClientProvider.overrideWithValue(AuthApiClient(dio)),
        deviceInfoProvider.overrideWithValue(
          const DeviceInfo(deviceId: 'd1', platform: 'android'),
        ),
        sessionControllerProvider.overrideWith(_Session.new),
      ],
    );
    addTearDown(c.dispose);

    final r = await c.read(authRepositoryProvider).signInWithPassword(
          identifier: '+12244224434',
          password: 'secret-pass',
        );

    expect(adapter.requests, hasLength(1));
    expect(adapter.requests.single.path, '/auth/password/login');
    expect(r.isSuccess, isTrue);
    expect(signal.lastKnown, isTrue); // the answer clears the flag
  });
}
