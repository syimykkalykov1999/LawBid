import 'package:flutter/foundation.dart';
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/exceptions.dart' as pk;
import 'package:passkeys/types.dart';
import 'package:passkeys_platform_interface/passkeys_platform_interface.dart';

/// Owner 2026-10-22 (checklist §1, research #5 B3): the device half of
/// WebAuthn behind one small port, so screens and the repository never
/// touch the plugin and tests swap in a fake.
///
/// The JSON in and out is exactly what `@simplewebauthn/server` produces
/// and expects (`PublicKeyCredentialCreationOptionsJSON` /
/// `RegistrationResponseJSON`, `PublicKeyCredentialRequestOptionsJSON` /
/// `AuthenticationResponseJSON`), so the API worker's endpoints and this
/// port agree without a generated client.
abstract interface class PasskeyAuthenticatorPort {
  /// The platform can create and use passkeys (OS version, a screen lock /
  /// biometrics, the web's WebAuthn support).
  Future<bool> isSupported();

  /// Creates a passkey from the server's registration options; returns the
  /// attestation response for `POST /auth/passkeys/register/verify`.
  Future<Map<String, dynamic>> register(Map<String, dynamic> options);

  /// Signs the server's challenge with an existing passkey; returns the
  /// assertion response for `POST /auth/passkeys/login/verify`.
  Future<Map<String, dynamic>> authenticate(Map<String, dynamic> options);
}

/// Why the authenticator stopped, in the app's own words (the plugin's
/// exception types stay inside this file).
enum PasskeyFailure { cancelled, noCredentials, unsupported, other }

class PasskeyAuthenticatorException implements Exception {
  const PasskeyAuthenticatorException(this.failure, [this.cause]);

  final PasskeyFailure failure;
  final Object? cause;

  @override
  String toString() => 'PasskeyAuthenticatorException($failure, $cause)';
}

/// The real one: corbado's `passkeys` plugin (Android Credential Manager,
/// iOS AuthenticationServices, the browser's WebAuthn; maintained, used by
/// the Corbado SDKs). The relying party id is whatever the server put in
/// the options (`lawbid.dev`); the OS checks it against the domain's
/// association files (docs/deeplinks).
class CorbadoPasskeyAuthenticator implements PasskeyAuthenticatorPort {
  CorbadoPasskeyAuthenticator({PasskeyAuthenticator? authenticator})
      : _authenticator = authenticator ?? PasskeyAuthenticator();

  final PasskeyAuthenticator _authenticator;

  @override
  Future<bool> isSupported() async {
    try {
      final a = await PasskeysPlatform.instance.getAvailability();
      return a.hasPasskeySupport;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<Map<String, dynamic>> register(Map<String, dynamic> options) async {
    try {
      final r = await _authenticator.register(
        RegisterRequestType.fromJson(options),
      );
      return r.toJson();
    } catch (e) {
      throw _wrap(e);
    }
  }

  @override
  Future<Map<String, dynamic>> authenticate(
    Map<String, dynamic> options,
  ) async {
    try {
      final r = await _authenticator.authenticate(
        AuthenticateRequestType.fromJson(
          options,
          // A plain button press: the system sheet lists the account's
          // passkeys at once (no autofill-style conditional UI).
          preferImmediatelyAvailableCredentials: false,
        ),
      );
      return r.toJson();
    } catch (e) {
      throw _wrap(e);
    }
  }

  static PasskeyAuthenticatorException _wrap(Object e) {
    if (e is PasskeyAuthenticatorException) return e;
    final failure = switch (e) {
      pk.PasskeyAuthCancelledException() => PasskeyFailure.cancelled,
      pk.NoCredentialsAvailableException() => PasskeyFailure.noCredentials,
      pk.DeviceNotSupportedException() ||
      pk.PasskeyUnsupportedException() ||
      pk.DomainNotAssociatedException() ||
      pk.MissingGoogleSignInException() ||
      pk.SyncAccountNotAvailableException() =>
        PasskeyFailure.unsupported,
      _ => PasskeyFailure.other,
    };
    if (kDebugMode && failure == PasskeyFailure.other) {
      debugPrint('passkey: $e');
    }
    return PasskeyAuthenticatorException(failure, e);
  }
}
