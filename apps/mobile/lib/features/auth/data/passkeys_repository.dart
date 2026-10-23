import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/data/passkey_authenticator.dart';
import 'package:lawbid/features/auth/data/passkeys_api_client.dart';
import 'package:lawbid/features/auth/domain/passkey.dart';

/// Owner 2026-10-22 (checklist §1): passkeys end to end — the server's
/// options, the device's authenticator, the server's verification — and
/// the session when a sign-in succeeds. Screens talk to this; it never
/// throws from [signIn] (a result says what happened) and throws
/// `ApiException` / [PasskeyAuthenticatorException] from the account
/// management calls, which the screens show as text.
abstract interface class PasskeysRepository {
  Future<bool> isSupported();
  Future<List<PasskeyInfo>> list();

  /// Creates a passkey for the signed-in account.
  Future<PasskeyInfo> add({String? name});
  Future<void> remove(String id);

  /// «Sign in with Face ID / fingerprint» on the welcome screen.
  Future<PasskeySignInResult> signIn();
}

class ApiPasskeysRepository implements PasskeysRepository {
  ApiPasskeysRepository({
    required PasskeysApiClient client,
    required PasskeyAuthenticatorPort authenticator,
    required SessionController session,
    DeviceInfo? deviceInfo,
  })  : _client = client,
        _authenticator = authenticator,
        _session = session,
        _deviceInfo = deviceInfo;

  final PasskeysApiClient _client;
  final PasskeyAuthenticatorPort _authenticator;
  final SessionController _session;
  final DeviceInfo? _deviceInfo;

  @override
  Future<bool> isSupported() => _authenticator.isSupported();

  @override
  Future<List<PasskeyInfo>> list() => _client.list();

  @override
  Future<PasskeyInfo> add({String? name}) async {
    final options = await _client.registerOptions();
    final response = await _authenticator.register(options);
    return _client.registerVerify(response: response, name: name);
  }

  @override
  Future<void> remove(String id) => _client.delete(id);

  @override
  Future<PasskeySignInResult> signIn() async {
    try {
      final options = await _client.loginOptions();
      final response = await _authenticator.authenticate(options);
      final tokens = await _client.loginVerify(
        response: response,
        deviceInfo: _deviceInfo,
      );
      await _session.applyTokens(tokens);
      return const PasskeySignInResult(PasskeySignInStatus.success);
    } on PasskeyAuthenticatorException catch (e) {
      return PasskeySignInResult(
        switch (e.failure) {
          PasskeyFailure.cancelled => PasskeySignInStatus.cancelled,
          PasskeyFailure.noCredentials => PasskeySignInStatus.noCredentials,
          PasskeyFailure.unsupported => PasskeySignInStatus.unsupported,
          PasskeyFailure.other => PasskeySignInStatus.failed,
        },
        e,
      );
    } catch (e) {
      return PasskeySignInResult(PasskeySignInStatus.failed, e);
    }
  }
}
