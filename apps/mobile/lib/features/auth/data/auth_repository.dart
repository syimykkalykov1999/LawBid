import '../domain/otp_verify_result.dart';
import '../domain/social_login_result.dart';

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
/// STILL OUT OF SCOPE (deliberately, per this pass's blueprint):
/// biometric reauth and the active-devices/account-deletion screens —
/// those remain later phases.
abstract interface class AuthRepository {
  /// Requests an SMS OTP for [phoneNumber] (E.164 format, e.g. "+15551234567").
  Future<void> requestOtp(String phoneNumber);

  /// Verifies [code] for [phoneNumber].
  Future<OtpVerifyResult> verifyOtp({required String phoneNumber, required String code});

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
}
