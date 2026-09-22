import 'package:freezed_annotation/freezed_annotation.dart';

part 'otp_verify_result.freezed.dart';

/// Result of an OTP verification attempt (file 01 §10/11 auth flow).
///
/// A union rather than a `bool success` so `OnboardingFlow` can show a
/// precise message per failure mode (wrong code vs. expired vs. locked vs.
/// rate-limited vs. network) — per the stage-1.7 architecture review
/// (ecc:code-architect, docs/CHANGELOG.md).
///
/// Real-backend wiring pass (docs/CHANGELOG.md, stage-1.7-auth):
/// [success] gained [isNewUser] (from `AuthTokensResult.isNewUser`, drives
/// whether `OnboardingFlow` skips the role step), and [locked]/
/// [rateLimited] were added for `AUTH_OTP_LOCKED` /
/// `AUTH_OTP_REQUEST_LIMIT`/`RATE_LIMITED` (apps/api's `ErrorCode` enum —
/// see `RealAuthRepository.verifyOtp` for the exact mapping). NOTE: this
/// file's `.freezed.dart` part was NOT regenerated as part of this change
/// (no `dart` binary available) — `dart run build_runner build` is
/// required before this compiles.
@freezed
sealed class OtpVerifyResult with _$OtpVerifyResult {
  const factory OtpVerifyResult.success({required bool isNewUser}) = OtpVerifySuccess;
  const factory OtpVerifyResult.invalid() = OtpVerifyInvalid;
  const factory OtpVerifyResult.expired() = OtpVerifyExpired;
  const factory OtpVerifyResult.locked() = OtpVerifyLocked;
  const factory OtpVerifyResult.rateLimited(int retryAfterSeconds) = OtpVerifyRateLimited;
  const factory OtpVerifyResult.networkError() = OtpVerifyNetworkError;
}
