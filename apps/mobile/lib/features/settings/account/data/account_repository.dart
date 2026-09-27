import 'package:dio/dio.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/social_auth_native_client.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/settings/account/domain/account_identifier.dart';

/// Settings → Account network calls (docs/01 §10.3, §10.5). Throws
/// [ApiException] — never a raw [DioException].
class AccountApiClient {
  AccountApiClient(this._dio);

  final Dio _dio;

  /// `GET /users/me/identifiers`.
  Future<List<Map<String, dynamic>>> listIdentifiers() async {
    try {
      final response =
          await _dio.get<Map<String, dynamic>>('/users/me/identifiers');
      final data = response.data?['data'];
      return data is List
          ? data.whereType<Map<String, dynamic>>().toList(growable: false)
          : const [];
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `POST /auth/identifiers` — creates a user_identifiers row, so it is a
  /// resource-creating POST (Idempotency-Key, safe retry).
  Future<void> linkIdentifier(Map<String, dynamic> body) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/identifiers',
        data: body,
        options: RequestFlags.createOptions(),
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}

/// Account identifiers: list + link additional phone/email/Apple/Google.
/// Changing the account's phone/email contact is NOT here — it reuses the
/// onboarding `ContactVerificationController` (reauth + code on the new
/// contact, docs/01 §11 3A).
abstract interface class AccountRepository {
  Future<List<AccountIdentifier>> listIdentifiers();

  /// `POST /auth/otp/request` to the identifier being linked — the server
  /// verifies it with the login OTP purpose in `POST /auth/identifiers`.
  Future<void> requestLinkCode(ContactType type, String value);

  Future<void> linkContact(ContactType type, String value, String code);

  /// Native Apple/Google sheet → `POST /auth/identifiers`.
  Future<SocialLinkOutcome> linkSocial(IdentifierProvider provider);
}

class ApiAccountRepository implements AccountRepository {
  ApiAccountRepository(this._client, this._auth, this._native);

  final AccountApiClient _client;
  final AuthApiClient _auth;
  final SocialAuthNativeClient _native;

  @override
  Future<List<AccountIdentifier>> listIdentifiers() async => [
        for (final row in await _client.listIdentifiers())
          if (AccountIdentifier.tryFromJson(row) case final identifier?)
            identifier,
      ];

  @override
  Future<void> requestLinkCode(ContactType type, String value) =>
      _auth.requestOtp(channel: type.wireName, identifier: value);

  @override
  Future<void> linkContact(ContactType type, String value, String code) =>
      _client.linkIdentifier({
        'provider': type.wireName,
        'identifier': value,
        'code': code,
      });

  @override
  Future<SocialLinkOutcome> linkSocial(IdentifierProvider provider) async {
    assert(provider.isSocial, 'Only apple/google link natively');
    final SocialCredential credential;
    try {
      credential = provider == IdentifierProvider.apple
          ? await _native.signInWithApple()
          : await _native.signInWithGoogle();
    } on SocialAuthCancelledException {
      return SocialLinkOutcome.cancelled;
    } on ApiException {
      rethrow;
    } catch (_) {
      // Native SDK failure (not configured, no network in the sheet, …).
      throw const ApiException(
        code: ApiErrorCodes.authSocialProviderUnavailable,
        message: 'Social sign-in is unavailable.',
      );
    }
    await _client.linkIdentifier({
      'provider': credential.provider,
      'idToken': credential.idToken,
      'nonce': credential.nonce,
    });
    return SocialLinkOutcome.linked;
  }
}
