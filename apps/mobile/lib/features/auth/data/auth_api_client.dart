import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

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
  /// tokens, so `AuthInterceptor` (core/network/auth_interceptor.dart) must
  /// not attach an Authorization header to them, and a 401 from one of
  /// these must never trigger the silent-refresh retry loop.
  static const Map<String, dynamic> _skipAuth = {RequestFlags.skipAuth: true};

  /// [linkChallenge]: email login only — see `MagicLinkVerifierStore`.
  Future<void> requestOtp({
    required String channel,
    required String identifier,
    String? linkChallenge,
  }) =>
      guardApiCall(
        () => _auth.requestOtp(
          body: api.OtpRequestDto(
            channel: api.OtpRequestDtoChannel.fromJson(channel),
            identifier: identifier,
            linkChallenge: linkChallenge,
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

  /// Owner 2026-10-04: `POST /auth/assistant/code` — the attorney's
  /// one-time code for an assistant seat; issues tokens like [verifyOtp].
  Future<AuthTokensResult> assistantCodeLogin({
    required String code,
    DeviceInfo? deviceInfo,
  }) async {
    final envelope = await guardApiCall(
      () => _auth.assistantCodeLogin(
        body: api.AssistantCodeLoginDto(code: code, deviceInfo: deviceInfo),
        extras: _skipAuth,
      ),
    );
    return envelope.data;
  }

  /// Owner 2026-10-20: the website's sign-in QR code (`POST /auth/qr`).
  Future<api.QrLoginCreatedDto> qrCreate() async {
    final envelope = await guardApiCall(
      () => _auth.qrCreate(
        body: const api.QrLoginCreateDto(),
        extras: _skipAuth,
      ),
    );
    return envelope.data;
  }

  /// `POST /auth/qr/poll` — the website waits for the phone's answer.
  Future<api.QrLoginPollResultDto> qrPoll({
    required String qrId,
    required String pollSecret,
  }) async {
    final envelope = await guardApiCall(
      () => _auth.qrPoll(
        body: api.QrLoginPollDto(qrId: qrId, pollSecret: pollSecret),
        extras: _skipAuth,
      ),
    );
    return envelope.data;
  }

  /// `GET /auth/qr/{qrId}` — the phone scanned the code: which browser?
  Future<api.QrLoginPreviewDto> qrPreview(String qrId) async {
    final envelope = await guardApiCall(() => _auth.qrPreview(qrId: qrId));
    return envelope.data;
  }

  /// `POST /auth/qr/{qrId}/approve` | `/reject`.
  Future<void> qrAnswer(String qrId, {required bool approve}) => guardApiCall(
        () =>
            approve ? _auth.qrApprove(qrId: qrId) : _auth.qrReject(qrId: qrId),
      );

  /// `POST /auth/otp/verify-link` — email magic link: the link's one-time
  /// `token` plus the `verifier` this device stored when it requested the
  /// code. Issues tokens like [verifyOtp] (same `_skipAuth`).
  /// Owner 2026-10-01: finish a sign-in that signs another phone / browser
  /// out (after `AUTH_OTHER_DEVICE_ACTIVE`).
  Future<AuthTokensResult> continueLogin(String pendingToken) async {
    final envelope = await guardApiCall(
      () => _auth.continueLogin(
        body: api.ContinueLoginDto(pendingToken: pendingToken),
        extras: _skipAuth,
      ),
    );
    return envelope.data;
  }

  Future<AuthTokensResult> verifyOtpLink({
    required String token,
    required String verifier,
    DeviceInfo? deviceInfo,
  }) async {
    final envelope = await guardApiCall(
      () => _auth.verifyOtpLink(
        body: api.OtpVerifyLinkDto(
          token: token,
          verifier: verifier,
          deviceInfo: deviceInfo,
        ),
        extras: _skipAuth,
      ),
    );
    return envelope.data;
  }

  /// `POST /auth/phone/status` — is this number registered, and does the
  /// account have a password.
  Future<({bool registered, bool hasPassword})> phoneStatus(
    String identifier,
  ) async {
    final envelope = await guardApiCall(
      () => _auth.phoneStatus(
        body: api.PhoneStatusDto(identifier: identifier),
        extras: _skipAuth,
      ),
    );
    return (
      registered: envelope.data.registered,
      hasPassword: envelope.data.hasPassword,
    );
  }

  /// Owner 2026-10-13: `POST /auth/password/login` — sign in with a phone
  /// number or e-mail and the password (no SMS); issues tokens.
  Future<AuthTokensResult> passwordLogin({
    required String identifier,
    required String password,
    DeviceInfo? deviceInfo,
  }) async {
    final envelope = await guardApiCall(
      () => _auth.passwordLogin(
        body: api.PasswordLoginDto(
          identifier: identifier,
          password: password,
          deviceInfo: deviceInfo,
        ),
        extras: _skipAuth,
      ),
    );
    return envelope.data;
  }

  /// `POST /auth/password` — sets the password of the signed-in account.
  /// Owner 2026-10-22 (security audit #3): [reauthToken] from
  /// `POST /auth/reauth` when the server asks for it (no password yet and
  /// the sign-in is not fresh).
  Future<void> setPassword(
    String password, {
    String? currentPassword,
    String? reauthToken,
  }) =>
      guardApiCall(
        () => _auth.setPassword(
          body: api.SetPasswordDto(
            password: password,
            currentPassword: currentPassword,
          ),
          xReauthToken: reauthToken,
        ),
      );

  /// `POST /auth/password/reset/request` — a code to the account's verified
  /// e-mail, else an SMS. Returns where it went (`email` | `phone`).
  Future<String> requestPasswordReset(String identifier) async {
    final envelope = await guardApiCall(
      () => _auth.passwordResetRequest(
        body: api.PasswordResetRequestDto(identifier: identifier),
        extras: _skipAuth,
      ),
    );
    return envelope.data.channel.json ?? 'phone';
  }

  /// `POST /auth/password/reset/confirm` — the code + a new password;
  /// issues tokens.
  Future<AuthTokensResult> confirmPasswordReset({
    required String identifier,
    required String code,
    required String newPassword,
    DeviceInfo? deviceInfo,
  }) async {
    final envelope = await guardApiCall(
      () => _auth.passwordResetConfirm(
        body: api.PasswordResetConfirmDto(
          identifier: identifier,
          code: code,
          newPassword: newPassword,
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

  /// [isDemo]: the stored refresh token belongs to a demo session, so the
  /// request must carry the demo header even before a session exists in
  /// memory (docs/ops/demo-world.md; `RequestFlags.demo`).
  Future<AuthTokensResult> refresh({
    required String refreshToken,
    DeviceInfo? deviceInfo,
    bool isDemo = false,
  }) async {
    final envelope = await guardApiCall(
      () => _auth.refresh(
        body: api.RefreshTokenDto(
          refreshToken: refreshToken,
          deviceInfo: deviceInfo,
        ),
        extras: isDemo ? {..._skipAuth, RequestFlags.demo: true} : _skipAuth,
      ),
    );
    return envelope.data;
  }

  /// No `skipAuth` here — `POST /auth/logout` isn't `@Public()` on the
  /// backend, it needs the bearer token, so `AuthInterceptor` must attach
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
  Future<String> reauth({
    required String identifier,
    required String code,
  }) async {
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
