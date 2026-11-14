import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/session/biometric_auth_service.dart';
import 'package:local_auth/local_auth.dart';

/// local_auth 3 (row 118): `authenticate` takes plain parameters instead of
/// `AuthenticationOptions`, and failures arrive as `LocalAuthException`.
/// The service must still ask for biometrics only, survive the app going
/// to the background mid-prompt (the old `stickyAuth`), and turn every
/// failure into `false` so the caller falls back to the OTP step.
class _FakeLocalAuth implements LocalAuthentication {
  _FakeLocalAuth({this.result = true, this.error});

  final bool result;
  final Exception? error;
  bool? biometricOnly;
  bool? persistAcrossBackgrounding;
  String? reason;

  @override
  Future<bool> authenticate({
    required String localizedReason,
    // AuthMessages lives in local_auth_platform_interface (not a direct
    // dependency); a wider parameter type is a valid override.
    Iterable<Object> authMessages = const <Object>[],
    bool biometricOnly = false,
    bool sensitiveTransaction = true,
    bool persistAcrossBackgrounding = false,
  }) async {
    reason = localizedReason;
    this.biometricOnly = biometricOnly;
    this.persistAcrossBackgrounding = persistAcrossBackgrounding;
    final e = error;
    if (e != null) throw e;
    return result;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('asks for biometrics only and keeps the prompt across backgrounding',
      () async {
    final fake = _FakeLocalAuth();
    final ok = await BiometricAuthService(fake).authenticate(reason: 'why');
    expect(ok, isTrue);
    expect(fake.reason, 'why');
    expect(fake.biometricOnly, isTrue);
    expect(fake.persistAcrossBackgrounding, isTrue);
  });

  test('a LocalAuthException (cancel, lockout, nothing enrolled) is false',
      () async {
    final fake = _FakeLocalAuth(
      error: const LocalAuthException(
        code: LocalAuthExceptionCode.userCanceled,
      ),
    );
    expect(await BiometricAuthService(fake).authenticate(reason: 'r'), isFalse);
  });

  test('a declined prompt is false', () async {
    final fake = _FakeLocalAuth(result: false);
    expect(await BiometricAuthService(fake).authenticate(reason: 'r'), isFalse);
  });
}
