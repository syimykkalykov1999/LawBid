import 'package:freezed_annotation/freezed_annotation.dart';

part 'social_login_result.freezed.dart';

/// Result of a native social sign-in + backend exchange (`POST
/// /auth/social`), mirroring [OtpVerifyResult]'s union style (see that
/// file's doc comment, otp_verify_result.dart, for why a union instead of
/// a `bool success`) — one variant per distinct outcome `RealAuthRepository
/// .signInWithApple()`/`.signInWithGoogle()` can produce, so
/// `OnboardingFlow` can show a precise message per failure mode instead of
/// a generic "something went wrong".
///
/// Phase 3 of the auth networking work (docs/CHANGELOG.md), continuing
/// directly after otp/verify+refresh (stage-1.7-auth, commit 152e193):
/// Apple/Google native SDK wiring against the already-live
/// `POST /auth/social` backend endpoint.
///
/// [cancelled] is NOT an error — it's the native sign-in sheet being
/// dismissed by the user, same as tapping outside an action sheet; see
/// `RealAuthRepository`'s doc comment on how `SocialAuthCancelledException`
/// (data/social_auth_native_client.dart) maps to it.
///
/// [accountExists] mirrors the backend's `ACCOUNT_EXISTS_USE_OTHER_METHOD`
/// (409, `details: {maskedIdentifier, availableMethods}` —
/// apps/api/src/common/errors/error-code.enum.ts): the social identity's
/// email already belongs to an account created a different way (e.g.
/// phone), so the UI can tell the user exactly which method(s) to use
/// instead rather than a generic failure.
///
/// NOTE: this file's `.freezed.dart` part was NOT regenerated as part of
/// this change (no `dart` binary available on this bridge) — `dart run
/// build_runner build` is required before this compiles.
@freezed
sealed class SocialLoginResult with _$SocialLoginResult {
  const factory SocialLoginResult.success({required bool isNewUser}) = SocialLoginSuccess;
  const factory SocialLoginResult.cancelled() = SocialLoginCancelled;
  const factory SocialLoginResult.invalidToken() = SocialLoginInvalidToken;
  const factory SocialLoginResult.providerDisabled() = SocialLoginProviderDisabled;
  const factory SocialLoginResult.accountExists({
    required String maskedIdentifier,
    required List<String> availableMethods,
  }) = SocialLoginAccountExists;
  const factory SocialLoginResult.suspended() = SocialLoginSuspended;
  const factory SocialLoginResult.deleted() = SocialLoginDeleted;
  const factory SocialLoginResult.networkError() = SocialLoginNetworkError;
}
