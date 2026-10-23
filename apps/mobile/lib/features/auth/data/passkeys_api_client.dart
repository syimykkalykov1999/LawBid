import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/domain/passkey.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-22 (checklist §1, docs/runbooks/PASSKEYS.md): the passkey
/// endpoints, through the generated `AuthClient` (PR #262's contract):
///
/// - `POST /auth/passkeys/register/options` (bearer; a sign-in ≤ 10 min
///   old or `X-Reauth-Token`) → `{options}`
/// - `POST /auth/passkeys/register { response, name? }` → `PasskeyDto`
/// - `GET /auth/passkeys` → `{passkeys}`; `DELETE /auth/passkeys/{id}`
/// - `POST /auth/passkeys/login/options { deviceInfo? }` (no token) →
///   `{challengeId, options}`
/// - `POST /auth/passkeys/login { challengeId, response, deviceInfo }` (no
///   token) → tokens, like `otp/verify`
/// - `POST /auth/passkeys/reauth/options` → `{challengeId, options}`;
///   `POST /auth/passkeys/reauth { challengeId, response }` → `{reauthToken}`
///
/// `options` / `response` are plain WebAuthn JSON, passed through as the
/// `passkeys` plugin produces and consumes them.
class PasskeysApiClient {
  PasskeysApiClient(Dio dio) : _auth = api.AuthClient(dio);

  final api.AuthClient _auth;

  static const _skipAuth = {RequestFlags.skipAuth: true};

  /// Without a sign-in ≤ 10 minutes old the server answers
  /// `REAUTH_REQUIRED` (the generated method carries no `X-Reauth-Token`
  /// parameter yet; the person is shown the usual text).
  Future<Map<String, dynamic>> registerOptions() => guardApiCall(() async {
        final r = await _auth.passkeyRegisterOptions();
        return _map(r.data.options);
      });

  Future<PasskeyInfo> registerVerify({
    required Map<String, dynamic> response,
    String? name,
  }) =>
      guardApiCall(() async {
        final r = await _auth.passkeyRegister(
          body: api.PasskeyRegisterDto(
            response: response,
            name: name != null && name.trim().isNotEmpty ? name.trim() : null,
          ),
          extras: const {RequestFlags.createsResource: true},
        );
        return _passkey(r.data);
      });

  /// `{challengeId, options}` for the sign-in.
  Future<PasskeyChallenge> loginOptions({DeviceInfo? deviceInfo}) =>
      guardApiCall(() async {
        final r = await _auth.passkeyLoginOptions(
          body: api.PasskeyLoginOptionsDto(deviceInfo: deviceInfo),
          extras: _skipAuth,
        );
        return PasskeyChallenge(r.data.challengeId, _map(r.data.options));
      });

  Future<AuthTokensResult> loginVerify({
    required String challengeId,
    required Map<String, dynamic> response,
    DeviceInfo? deviceInfo,
  }) =>
      guardApiCall(() async {
        final r = await _auth.passkeyLogin(
          body: api.PasskeyLoginDto(
            challengeId: challengeId,
            response: response,
            deviceInfo: deviceInfo,
          ),
          extras: _skipAuth,
        );
        return r.data;
      });

  Future<PasskeyChallenge> reauthOptions() => guardApiCall(() async {
        final r = await _auth.passkeyReauthOptions();
        return PasskeyChallenge(r.data.challengeId, _map(r.data.options));
      });

  /// The single-use `X-Reauth-Token` (like `POST /auth/reauth`).
  Future<String> reauthVerify({
    required String challengeId,
    required Map<String, dynamic> response,
  }) =>
      guardApiCall(() async {
        final r = await _auth.passkeyReauth(
          body: api.PasskeyAssertDto(
            challengeId: challengeId,
            response: response,
          ),
        );
        return r.data.reauthToken;
      });

  Future<List<PasskeyInfo>> list() => guardApiCall(() async {
        final r = await _auth.passkeyList();
        return r.data.passkeys.map(_passkey).toList(growable: false);
      });

  Future<void> delete(String id) =>
      guardApiCall(() => _auth.passkeyRemove(id: id));

  static Map<String, dynamic> _map(Object? v) =>
      v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

  static PasskeyInfo _passkey(api.PasskeyDto d) => PasskeyInfo(
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
        backedUp: d.backedUp,
      );
}

/// A server challenge and the WebAuthn request options that go with it.
class PasskeyChallenge {
  const PasskeyChallenge(this.challengeId, this.options);

  final String challengeId;
  final Map<String, dynamic> options;
}
