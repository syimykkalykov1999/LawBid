import 'package:local_auth/local_auth.dart';

/// Local Face ID/Touch ID/fingerprint gate (docs/01_FOUNDATION_AUTH.md
/// §10.1: "повторная аутентификация: биометрия ... или повторный OTP").
///
/// Phase 4 of the auth networking work (docs/CHANGELOG.md), continuing
/// after Phase 3 social login (commit 2bbeba5).
///
/// IMPORTANT — what this does and does NOT prove to the server: reading
/// `apps/api/src/modules/auth/dto/reauth.dto.ts` (the actual backend
/// source, not just the docs table), `ReauthDto.method` only accepts
/// `'otp'`. That file's own doc comment says why: "biometric" is
/// intentionally not a valid value yet because the server can't verify an
/// on-device Face ID/Touch ID assertion without platform key attestation
/// (App Attest / Play Integrity), which is a separate, currently-stubbed
/// seam. So a successful [authenticate] here proves "the person holding
/// this device passed their OS biometric check" — a genuine local
/// device-owner signal — but it does NOT by itself mint a
/// `POST /auth/reauth` `reauthToken`; only a correct OTP code does that.
/// Call sites (see DeleteAccountController) use this as a fast local gate
/// ahead of the phone+OTP step, not as a replacement for it.
///
/// Every failure mode collapses to `false` rather than throwing — no
/// hardware, nothing enrolled, user declined/cancelled, lockout, or any
/// plugin/platform exception (e.g. a host app misconfiguration: missing
/// `NSFaceIDUsageDescription` on iOS, a non-`FragmentActivity` on
/// Android). A caller that gates a destructive-action flow on this must
/// always have a non-biometric fallback (OTP) ready regardless of why
/// biometrics didn't succeed.
class BiometricAuthService {
  BiometricAuthService([LocalAuthentication? localAuth])
      : _localAuth = localAuth ?? LocalAuthentication();

  final LocalAuthentication _localAuth;

  /// Whether this device can plausibly offer a biometric prompt right now:
  /// hardware present AND at least one biometric enrolled. Screens use this
  /// to decide whether to show a "Use Face ID" affordance at all, rather
  /// than showing it and having [authenticate] immediately fail.
  Future<bool> isAvailable() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      if (!supported) return false;
      final canCheck = await _localAuth.canCheckBiometrics;
      if (!canCheck) return false;
      final enrolled = await _localAuth.getAvailableBiometrics();
      return enrolled.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Shows the OS biometric prompt with [reason] and returns whether the
  /// person authenticated successfully. `false` covers every non-success
  /// path — see this class's doc comment for why callers must not treat
  /// `false` as an error to surface, just "biometrics didn't work this
  /// time, fall back to OTP".
  Future<bool> authenticate({required String reason}) async {
    try {
      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(biometricOnly: true, stickyAuth: true),
      );
    } catch (_) {
      return false;
    }
  }
}
