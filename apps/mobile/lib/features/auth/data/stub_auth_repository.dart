import '../domain/otp_verify_result.dart';
import 'auth_repository.dart';

/// Stage-1.7-screens stub (docs/CHANGELOG.md): simulates network latency,
/// accepts ANY 6-digit code as valid EXCEPT the literal `000000`, reserved
/// so the error-state UI (and any future golden test) has a deterministic
/// way to trigger "invalid code" without a real backend. No network call —
/// file 01 §4.11/§10's real OTP endpoints (already live in the stage-1.4
/// backend) are wired in behind [AuthRepository] in the not-yet-started
/// full-auth pass (dio, secure storage, `SessionState` — see
/// [AuthRepository]'s doc comment).
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
    return const OtpVerifyResult.success();
  }
}
