import '../domain/otp_verify_result.dart';

/// Auth operations needed by the onboarding screens (file 01 §10/11).
///
/// SCOPE NOTE (docs/CHANGELOG.md stage 1.7 "screens" entry — read this
/// before extending the interface): file 01 §15's full stage-1.7 scope also
/// includes dio interceptors (auth/refresh/idempotency/retry), secure
/// token storage, `SessionState`, Apple/Google native SDK calls, and
/// biometric reauth. NONE of that is here yet — this interface covers
/// exactly what welcome/phone/otp/role need to function end-to-end against
/// a fake backend, per the user's explicit instruction to build the real
/// SCREENS now. [StubAuthRepository] is the only implementation; swapping
/// in a real dio-backed one is a provider-override change
/// (`authRepositoryProvider` in application/auth_providers.dart), not a
/// call-site change, by design — same pattern as `ThemeModeRepository`.
abstract interface class AuthRepository {
  /// Requests an SMS OTP for [phoneNumber] (E.164 format, e.g. "+15551234567").
  Future<void> requestOtp(String phoneNumber);

  /// Verifies [code] for [phoneNumber].
  Future<OtpVerifyResult> verifyOtp({required String phoneNumber, required String code});
}
