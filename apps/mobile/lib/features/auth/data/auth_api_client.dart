import 'package:dio/dio.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../../core/network/api_error.dart';
import '../../../core/network/request_flags.dart';
import 'auth_dtos.dart';

/// One method per `/auth/*` endpoint the app uses (docs/01_FOUNDATION_AUTH.md
/// §10.5), on top of the generated client (`package:lawbid_api`, docs/01
/// §6.3) driven by the app's own [Dio] — so every call still goes through
/// its interceptors (headers, auth + silent refresh, idempotency, retry).
/// Every method converts any failure into an [ApiException] via
/// [guardApiCall] — callers never see a raw [DioException] or a parse error.
class AuthApiClient {
  AuthApiClient(Dio dio)
      : _auth = api.AuthClient(dio),
        _users = api.UsersClient(dio);

  final api.AuthClient _auth;
  final api.UsersClient _users;

  /// otp/request, otp/verify, social, and refresh issue or exchange
  /// tokens, so [AuthInterceptor] (core/network/auth_interceptor.dart) must
  /// not attach an Authorization header to them, and a 401 from one of
  /// these must never trigger the silent-refresh retry loop.
  static const Map<String, dynamic> _skipAuth = {RequestFlags.skipAuth: true};

  Future<void> requestOtp({required String channel, required String identifier}) =>
      guardApiCall(
        () => _auth.requestOtp(
          body: api.OtpRequestDto(
            channel: api.OtpRequestDtoChannel.fromJson(channel),
            identifier: identifier,
          ),
          extras: _skipAuth,
        ),
      );

  Future<AuthTokensResult> verifyOtp({
    required String channel,
    required String identifier,
    required String code,
    DeviceInfo? deviceInfo,
  }) async {
    final envelope = await guardApiCall(
      () => _auth.verifyOtp(
        body: api.OtpVerifyDto(
          channel: api.OtpVerifyDtoChannel.fromJson(channel),
          identifier: identifier,
          code: code,
          deviceInfo: deviceInfo,
        ),
        extras: _skipAuth,
      ),
    );
    return envelope.data;
  }

  /// `POST /auth/social` — the other endpoint that issues tokens rather
  /// than requiring them (same `_skipAuth` as [verifyOtp]).
  Future<AuthTokensResult> socialLogin(api.SocialLoginDto body) async {
    final envelope = await guardApiCall(
      () => _auth.social(body: body, extras: _skipAuth),
    );
    return envelope.data;
  }

  Future<AuthTokensResult> refresh({
    required String refreshToken,
    DeviceInfo? deviceInfo,
  }) async {
    final envelope = await guardApiCall(
      () => _auth.refresh(
        body: api.RefreshTokenDto(refreshToken: refreshToken, deviceInfo: deviceInfo),
        extras: _skipAuth,
      ),
    );
    return envelope.data;
  }

  /// No `skipAuth` here — `POST /auth/logout` isn't `@Public()` on the
  /// backend, it needs the bearer token, so [AuthInterceptor] must attach
  /// it normally.
  Future<void> logout() => guardApiCall(_auth.logout);

  /// `POST /auth/logout-all` (file 01 §10.5 "все сессии"). Same
  /// auth-required shape as [logout].
  Future<void> logoutAll() => guardApiCall(_auth.logoutAll);

  /// `GET /auth/sessions` — every active session/device of the current
  /// user (file 01 §10.4 "Активные устройства").
  Future<List<DeviceSession>> listSessions() async {
    final envelope = await guardApiCall(_auth.listSessions);
    return envelope.data.map(DeviceSession.fromDto).toList(growable: false);
  }

  /// `DELETE /auth/sessions/{id}` — revokes one session/device (file 01
  /// §10.4 "кнопка «Выйти на этом устройстве»", applied to any row).
  Future<void> endSession(String sessionId) =>
      guardApiCall(() => _auth.endSession(id: sessionId));

  /// `POST /auth/reauth` (file 01 §10.5), the OTP path — `method` is always
  /// `otp` (`ReauthDto`: biometric is not a valid value without platform
  /// attestation). [identifier] is whichever verified phone/email the code
  /// was sent to; the server checks it belongs to the CURRENT user. Returns
  /// the single-use `reauthToken` (5 minutes, `REAUTH_TOKEN_TTL_SECONDS`)
  /// for the `X-Reauth-Token` header of a sensitive action — see
  /// [deleteAccount].
  Future<String> reauth({required String identifier, required String code}) async {
    final envelope = await guardApiCall(
      () => _auth.reauth(
        body: api.ReauthDto(
          method: api.ReauthDtoMethod.otp,
          identifier: identifier,
          code: code,
        ),
      ),
    );
    return envelope.data.reauthToken;
  }

  /// `DELETE /users/me` (file 01 §10.7) — starts the 14-day deletion grace
  /// period; the server revokes every session (including this one)
  /// immediately on success, so the caller must treat a successful call as
  /// an implicit local logout. Requires a fresh [reauthToken] from
  /// [reauth], sent as `X-Reauth-Token` (the generated client's header
  /// parameter, from the OpenAPI contract).
  Future<void> deleteAccount({required String reauthToken}) =>
      guardApiCall(() => _users.deleteAccount(xReauthToken: reauthToken));
}
