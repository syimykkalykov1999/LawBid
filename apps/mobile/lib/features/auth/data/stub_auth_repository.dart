import 'package:lawbid/features/auth/data/auth_dtos.dart' show DeviceSession;
import 'package:lawbid/features/auth/data/auth_repository.dart';
import 'package:lawbid/features/auth/domain/account_deletion_result.dart';
import 'package:lawbid/features/auth/domain/otp_verify_result.dart';
import 'package:lawbid/features/auth/domain/reauth_result.dart';
import 'package:lawbid/features/auth/domain/social_login_result.dart';

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
  Future<void> requestOtp(String identifier, {String channel = 'phone'}) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }

  @override
  Future<OtpVerifyResult> verifyOtp({
    required String identifier,
    required String code,
    String channel = 'phone',
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (code == _invalidCode) return const OtpVerifyResult.invalid();
    return const OtpVerifyResult.success(isNewUser: true);
  }

  @override
  Future<OtpVerifyResult> verifyEmailLink({
    required String token,
    required String verifier,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    return const OtpVerifyResult.success(isNewUser: true);
  }

  /// Phase 3 (docs/CHANGELOG.md): always succeeds as a new user, same
  /// simulated-latency convention as [verifyOtp]/[requestOtp] above — kept
  /// in sync with [AuthRepository]'s interface purely so widget/golden
  /// tests that override `authRepositoryProvider` with this stub keep
  /// compiling; no test exercises the social buttons today.
  @override
  Future<SocialLoginResult> signInWithApple() async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    return const SocialLoginResult.success(isNewUser: true);
  }

  @override
  Future<SocialLoginResult> signInWithGoogle() async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    return const SocialLoginResult.success(isNewUser: true);
  }

  @override
  Future<void> logout() async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }

  /// Phase 4 (docs/CHANGELOG.md): same simulated-latency, always-succeeds
  /// convention as the rest of this stub — kept in sync with
  /// [AuthRepository]'s interface purely so widget/golden tests that
  /// override `authRepositoryProvider` with this stub keep compiling; no
  /// test exercises the active-devices/delete-account screens today.
  @override
  Future<void> logoutAll() async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }

  @override
  Future<List<DeviceSession>> listSessions() async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    return const [
      DeviceSession(
        sessionId: 'stub-current',
        deviceId: 'stub-device',
        deviceName: 'This device',
        platform: 'ios',
        appVersion: '0.1.0',
        lastUsedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        isCurrent: true,
      ),
    ];
  }

  @override
  Future<void> revokeSession(String sessionId) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }

  @override
  Future<ReauthResult> reauthWithOtp({
    required String identifier,
    required String code,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (code == _invalidCode) return const ReauthResult.invalid();
    return const ReauthResult.success(reauthToken: 'stub-reauth-token');
  }

  @override
  Future<AccountDeletionResult> deleteAccount({
    required String reauthToken,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    return const AccountDeletionResult.success();
  }
}
