import '../domain/account_deletion_result.dart';
import '../domain/otp_verify_result.dart';
import '../domain/reauth_result.dart';
import '../domain/social_login_result.dart';
import 'auth_dtos.dart' show DeviceSession;

/// Auth operations needed by the onboarding screens (file 01 §10/11) plus
/// session teardown (file 01 §10.5 `POST /auth/logout`).
///
/// Real-backend wiring pass (docs/CHANGELOG.md, stage-1.7-auth):
/// `RealAuthRepository` is now `authRepositoryProvider`'s default,
/// dio-backed against the live `/auth/*` endpoints (core/network +
/// core/session hold the interceptors/secure storage/`SessionState`).
/// `StubAuthRepository` stays in the codebase for widget/golden tests but
/// is no longer wired by default — swap back via an explicit provider
/// override in a test, never by editing this interface's default
/// implementation pointer.
///
/// Phase 3 (docs/CHANGELOG.md, continuing directly after stage-1.7-auth,
/// commit 152e193) added [signInWithApple]/[signInWithGoogle] — native
/// Apple/Google sign-in against `POST /auth/social`.
///
/// Phase 4 (docs/CHANGELOG.md, continuing directly after Phase 3 social
/// login, commit 2bbeba5) added [logoutAll], [listSessions]/
/// [revokeSession] (file 01 §10.4's "Активные устройства"), and
/// [reauthWithOtp]/[deleteAccount] (file 01 §10.1/§10.7's reauth-gated
/// account deletion). Biometric reauth itself
/// (core/session/biometric_auth_service.dart) is a LOCAL capability, not a
/// repository method — see that file's doc comment for why it never
/// reaches this interface: the backend's `ReauthDto` only accepts
/// `method: 'otp'`, so there is nothing for a repository method to POST
/// for a biometric result on its own.
abstract interface class AuthRepository {
  /// Requests a login OTP for [identifier] — an E.164 phone (SMS, default
  /// [channel] `'phone'`) or, since stage 1.7 mobile, an email address
  /// (`channel: 'email'`, file 01 §10.2 E).
  Future<void> requestOtp(String identifier, {String channel = 'phone'});

  /// Verifies [code] for [identifier] on [channel]; applies the session on
  /// success.
  Future<OtpVerifyResult> verifyOtp({
    required String identifier,
    required String code,
    String channel = 'phone',
  });

  /// Native Apple sign-in (`sign_in_with_apple`) + `POST /auth/social`
  /// exchange (file 07 §6.1). Returns `.cancelled()` rather than throwing
  /// when the user dismisses the native sheet — see
  /// `SocialAuthNativeClient`'s doc comment (data/
  /// social_auth_native_client.dart).
  Future<SocialLoginResult> signInWithApple();

  /// Same as [signInWithApple], via Google (`google_sign_in`) instead.
  Future<SocialLoginResult> signInWithGoogle();

  /// Logs out the current session (`POST /auth/logout`). Callers should
  /// clear local session state (`SessionController.clear()`) regardless of
  /// whether this succeeds — a session that's already gone server-side
  /// makes this a no-op there, but the local state still needs clearing.
  Future<void> logout();

  /// Logs out every session/device (`POST /auth/logout-all`, file 01
  /// §10.4's "«Выйти везде»"). Same local-state-clearing contract as
  /// [logout] — the caller clears `SessionController` regardless of
  /// whether the call itself succeeds.
  Future<void> logoutAll();

  /// Lists every active session/device for the current user (`GET
  /// /auth/sessions`, file 01 §10.4's "Активные устройства").
  Future<List<DeviceSession>> listSessions();

  /// Revokes one session/device (`DELETE /auth/sessions/:id`). Works on
  /// any session id, including the caller's own current one — a caller
  /// revoking its own current session should also clear local session
  /// state afterward, same as [logout].
  Future<void> revokeSession(String sessionId);

  /// `POST /auth/reauth` with the OTP method (see [ReauthResult]'s doc
  /// comment for why that's the only method this ever sends). [identifier]
  /// must be a phone/email already verified on the CURRENT account —
  /// callers ask the person for it (there is no `GET /users/me` endpoint
  /// yet to look it up automatically, see docs/CHANGELOG.md's Phase 4
  /// entry) and must already have requested an OTP for it via
  /// [requestOtp]-equivalent (`POST /auth/otp/request`, which is
  /// `@Public()` and accepts any channel/identifier — see
  /// `AuthApiClient.requestOtp`) before calling this with the code the
  /// person received.
  Future<ReauthResult> reauthWithOtp({required String identifier, required String code});

  /// `DELETE /users/me` (file 01 §10.7) — starts the 14-day deletion grace
  /// period. Requires a fresh, unused [reauthToken] from [reauthWithOtp].
  /// On [AccountDeletionResult.success], the server has already revoked
  /// every session for this account (including the caller's own) — the
  /// caller must clear local session state and route to Welcome, it will
  /// NOT get a chance to make another authenticated call first.
  Future<AccountDeletionResult> deleteAccount({required String reauthToken});
}
