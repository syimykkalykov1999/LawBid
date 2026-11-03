import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
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
}
