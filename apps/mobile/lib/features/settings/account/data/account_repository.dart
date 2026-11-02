import 'package:dio/dio.dart';

import 'package:lawbid/core/network/api_error.dart';
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
}

/// Account identifiers: the read-only list (the extra sign-in link feature
/// was removed 2026-10-28).
/// Changing the account's phone/email contact is NOT here — it reuses the
/// onboarding `ContactVerificationController` (reauth + code on the new
/// contact, docs/01 §11 3A).
// ignore: one_member_abstracts
abstract interface class AccountRepository {
  Future<List<AccountIdentifier>> listIdentifiers();
}

class ApiAccountRepository implements AccountRepository {
  ApiAccountRepository(this._client);

  final AccountApiClient _client;

  @override
  Future<List<AccountIdentifier>> listIdentifiers() async => [
        for (final row in await _client.listIdentifiers())
          if (AccountIdentifier.tryFromJson(row) case final identifier?)
            identifier,
      ];
}
