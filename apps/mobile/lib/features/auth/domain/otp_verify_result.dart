import 'package:freezed_annotation/freezed_annotation.dart';

part 'otp_verify_result.freezed.dart';

/// Result of an OTP verification attempt (file 01 §10/11 auth flow).
///
/// A union rather than a `bool success` so the OTP screen can show a
/// precise message per failure mode (wrong code vs. expired vs. network) —
/// per the stage-1.7 architecture review (ecc:code-architect,
/// docs/CHANGELOG.md).
@freezed
class OtpVerifyResult with _$OtpVerifyResult {
  const factory OtpVerifyResult.success() = OtpVerifySuccess;
  const factory OtpVerifyResult.invalid() = OtpVerifyInvalid;
  const factory OtpVerifyResult.expired() = OtpVerifyExpired;
  const factory OtpVerifyResult.networkError() = OtpVerifyNetworkError;
}
