import 'package:lawbid/features/auth/data/passkey_authenticator.dart';

/// Owner 2026-10-22 (checklist §1): a device authenticator with no
/// platform — answers with canned WebAuthn responses, records what it was
/// asked, or fails the way the real one does.
class FakePasskeyAuthenticator implements PasskeyAuthenticatorPort {
  FakePasskeyAuthenticator({this.supported = true, this.failWith});

  bool supported;

  /// When set, [register] / [authenticate] throw this failure.
  PasskeyFailure? failWith;

  final registerOptions = <Map<String, dynamic>>[];
  final authenticateOptions = <Map<String, dynamic>>[];

  @override
  Future<bool> isSupported() async => supported;

  @override
  Future<Map<String, dynamic>> register(Map<String, dynamic> options) async {
    registerOptions.add(options);
    final f = failWith;
    if (f != null) throw PasskeyAuthenticatorException(f);
    return {
      'id': 'cred-1',
      'rawId': 'cred-1',
      'type': 'public-key',
      'response': {
        'clientDataJSON': 'cdj',
        'attestationObject': 'att',
        'transports': ['internal'],
      },
      'clientExtensionResults': <String, dynamic>{},
    };
  }

  @override
  Future<Map<String, dynamic>> authenticate(
    Map<String, dynamic> options,
  ) async {
    authenticateOptions.add(options);
    final f = failWith;
    if (f != null) throw PasskeyAuthenticatorException(f);
    return {
      'id': 'cred-1',
      'rawId': 'cred-1',
      'type': 'public-key',
      'response': {
        'clientDataJSON': 'cdj',
        'authenticatorData': 'ad',
        'signature': 'sig',
        'userHandle': 'user-1',
      },
      'clientExtensionResults': <String, dynamic>{},
    };
  }
}
