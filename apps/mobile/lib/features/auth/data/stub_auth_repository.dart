import '../domain/otp_verify_result.dart';
import 'auth_repository.dart';

/// Local-only stub kept for widget/golden tests (docs/CHANGELOG.md) — no
/// longer `authRepositoryProvider`'s default as of the real-backend wiring
/// pass (see [AuthRepository]'s doc comment); override the provider
/// explicitly wherever this is still needed. Simulates network latency,
/// accepts ANY 6-digit code as valid EXCEPT the literal `000000`, reserved
/// so the error-state UI (and any golden test) has a deterministic way to
/// trigger "invalid code" without a real backend.
class StubAuthRepository implements AuthRepository {
  const StubAuthRepository();

  static const _invalidCode = '000000';

  @override
  Future<void> requestOtp(String phoneNumber) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }

  @override
  Future<OtpVerifyResult> verifyOtp({required String phoneNumber, required String code}) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (code == _invalidCode) return const OtpVerifyResult.invalid();
    return const OtpVerifyResult.success(isNewUser: true);
  }

  @override
  Future<void> logout() async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }
}
