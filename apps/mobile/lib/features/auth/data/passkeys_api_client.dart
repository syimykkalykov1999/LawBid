import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/domain/passkey.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-22 (checklist §1): the passkey endpoints the API worker
/// adds with `@simplewebauthn/server` (hand-written on dio until the
/// contract is regenerated — swap for the generated client then):
///
/// - `POST /auth/passkeys/register/options` (signed in) →
///   `PublicKeyCredentialCreationOptionsJSON`
/// - `POST /auth/passkeys/register/verify { response, name? }` → the key
/// - `POST /auth/passkeys/login/options {}` (no token) →
///   `PublicKeyCredentialRequestOptionsJSON`
/// - `POST /auth/passkeys/login/verify { response, deviceInfo }` (no
///   token) → tokens, like otp/verify
/// - `GET /users/me/passkeys`, `DELETE /users/me/passkeys/:id`
///
/// Every answer is the usual `{ data }` envelope; the options may sit in
/// `data` itself or under `data.options` — both are read.
class PasskeysApiClient {
  PasskeysApiClient(this._dio);

  final Dio _dio;

  static const _skipAuth = {RequestFlags.skipAuth: true};

  Future<Map<String, dynamic>> registerOptions() => guardApiCall(() async {
        final r = await _dio.post<Object?>('/auth/passkeys/register/options');
        return _options(r.data);
      });

  Future<PasskeyInfo> registerVerify({
    required Map<String, dynamic> response,
    String? name,
  }) =>
      guardApiCall(() async {
        final r = await _dio.post<Object?>(
          '/auth/passkeys/register/verify',
          data: {
            'response': response,
            if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
          },
          options: Options(extra: const {RequestFlags.createsResource: true}),
        );
        return _passkey(_data(r.data));
      });

  Future<Map<String, dynamic>> loginOptions() => guardApiCall(() async {
        final r = await _dio.post<Object?>(
          '/auth/passkeys/login/options',
          data: const <String, Object?>{},
          options: Options(extra: _skipAuth),
        );
        return _options(r.data);
      });

  Future<AuthTokensResult> loginVerify({
    required Map<String, dynamic> response,
    DeviceInfo? deviceInfo,
  }) =>
      guardApiCall(() async {
        final r = await _dio.post<Object?>(
          '/auth/passkeys/login/verify',
          data: {
            'response': response,
            if (deviceInfo != null) 'deviceInfo': deviceInfo.toJson(),
          },
          options: Options(extra: _skipAuth),
        );
        return api.AuthTokensDto.fromJson(_data(r.data));
      });

  Future<List<PasskeyInfo>> list() => guardApiCall(() async {
        final r = await _dio.get<Object?>('/users/me/passkeys');
        final body = r.data;
        final data = body is Map ? body['data'] : null;
        if (data is! List) return const [];
        return [
          for (final e in data)
            if (e is Map) _passkey(Map<String, Object?>.from(e)),
        ];
      });

  Future<void> delete(String id) => guardApiCall(
        () => _dio.delete<void>(
          '/users/me/passkeys/${Uri.encodeComponent(id)}',
        ),
      );

  static Map<String, Object?> _data(Object? body) {
    final data = body is Map ? body['data'] : null;
    if (data is! Map) throw const FormatException('passkeys: no data');
    return Map<String, Object?>.from(data);
  }

  static Map<String, dynamic> _options(Object? body) {
    final data = _data(body);
    final inner = data['options'];
    return Map<String, dynamic>.from(inner is Map ? inner : data);
  }

  static PasskeyInfo _passkey(Map<String, Object?> m) => PasskeyInfo(
        id: '${m['id'] ?? m['credentialId'] ?? ''}',
        name: '${m['name'] ?? m['deviceName'] ?? ''}',
        createdAt: DateTime.tryParse('${m['createdAt'] ?? ''}') ??
            DateTime.fromMillisecondsSinceEpoch(0),
        lastUsedAt: DateTime.tryParse('${m['lastUsedAt'] ?? ''}'),
        backedUp: m['backedUp'] == true,
      );
}
