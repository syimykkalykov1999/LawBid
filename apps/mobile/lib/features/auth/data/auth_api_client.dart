import 'package:dio/dio.dart';

import '../../../core/network/api_error.dart';
import 'auth_dtos.dart';

/// One method per `/auth/*` endpoint wired in this pass
/// (docs/01_FOUNDATION_AUTH.md §10.5). Every method converts any failure
/// into an [ApiException] via [ApiException.fromDioException] — callers
/// never see a raw [DioException].
class AuthApiClient {
  AuthApiClient(this._dio);

  final Dio _dio;

  /// otp/request, otp/verify, social, and refresh issue or exchange
  /// tokens, so [AuthInterceptor] (core/network/auth_interceptor.dart) must
  /// not attach an Authorization header to them, and a 401 from one of
  /// these must never trigger the silent-refresh retry loop.
  Options get _skipAuth => Options(extra: const {'skipAuth': true});

  Future<void> requestOtp({required String channel, required String identifier}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/otp/request',
        data: OtpRequestPayload(channel: channel, identifier: identifier).toJson(),
        options: _skipAuth,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<AuthTokensResult> verifyOtp({
    required String channel,
    required String identifier,
    required String code,
    DeviceInfo? deviceInfo,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/otp/verify',
        data: OtpVerifyPayload(
          channel: channel,
          identifier: identifier,
          code: code,
          deviceInfo: deviceInfo,
        ).toJson(),
        options: _skipAuth,
      );
      return AuthTokensResult.fromJson(_unwrap(response));
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `POST /auth/social` (Phase 3 of the auth networking work,
  /// docs/CHANGELOG.md) — same envelope/`_skipAuth`/`_unwrap` pattern as
  /// [verifyOtp] above; this is the other endpoint that issues tokens
  /// rather than requiring them.
  Future<AuthTokensResult> socialLogin(SocialLoginPayload payload) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/social',
        data: payload.toJson(),
        options: _skipAuth,
      );
      return AuthTokensResult.fromJson(_unwrap(response));
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<AuthTokensResult> refresh({
    required String refreshToken,
    DeviceInfo? deviceInfo,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: RefreshPayload(refreshToken: refreshToken, deviceInfo: deviceInfo).toJson(),
        options: _skipAuth,
      );
      return AuthTokensResult.fromJson(_unwrap(response));
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// No `skipAuth` here — `POST /auth/logout` isn't `@Public()` on the
  /// backend, it needs the bearer token, so [AuthInterceptor] must attach
  /// it normally.
  Future<void> logout() async {
    try {
      await _dio.post<Map<String, dynamic>>('/auth/logout');
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Unwraps the backend's success envelope (docs/01_FOUNDATION_AUTH.md
  /// §7: `{data, meta?}`) — every endpoint's real payload is under
  /// `data`.
  Map<String, dynamic> _unwrap(Response<Map<String, dynamic>> response) {
    final envelope = response.data?['data'];
    if (envelope is Map<String, dynamic>) return envelope;
    throw const ApiException(
      code: ApiException.networkErrorCode,
      message: 'Unexpected response shape from the server.',
    );
  }
}
