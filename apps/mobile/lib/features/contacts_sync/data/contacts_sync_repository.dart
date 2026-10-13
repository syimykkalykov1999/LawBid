import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';

/// Server state of the user's contacts sync.
class ContactsSyncStatus {
  const ContactsSyncStatus({required this.enabled, required this.matches});

  final bool enabled;
  final int matches;
}

/// Owner 2026-10-13: `/contacts/sync`. Only
/// SHA-256 hashes of phone numbers are sent (see phone_numbers.dart).
// TODO(contract): switch to the generated ContactsSyncClient once
// packages/api-contract/generate.sh has been run for the new endpoints.
abstract interface class ContactsSyncRepository {
  Future<ContactsSyncStatus> status();

  /// Uploads [hashes] in chunks; returns how many belong to LawBid users.
  Future<int> upload(Set<String> hashes);

  /// Turns the sync off and deletes every match.
  Future<void> remove();
}

class ApiContactsSyncRepository implements ContactsSyncRepository {
  ApiContactsSyncRepository(this._dio);

  final Dio _dio;

  /// Same cap as the server (CONTACT_HASHES_MAX).
  static const chunkSize = 2000;

  @override
  Future<ContactsSyncStatus> status() async {
    final res = await guardApiCall(
      () => _dio.get<Map<String, Object?>>(
        '/contacts/sync',
      ),
    );
    final data = (res.data?['data'] as Map?)?.cast<String, Object?>();
    return ContactsSyncStatus(
      enabled: data?['enabled'] == true,
      matches: (data?['matches'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  Future<int> upload(Set<String> hashes) async {
    final all = hashes.toList(growable: false);
    var matched = 0;
    for (var i = 0; i < all.length; i += chunkSize) {
      final chunk = all.sublist(
        i,
        i + chunkSize > all.length ? all.length : i + chunkSize,
      );
      final res = await guardApiCall(
        () => _dio.post<Map<String, Object?>>(
          '/contacts/sync',
          data: {'hashes': chunk},
        ),
      );
      final data = (res.data?['data'] as Map?)?.cast<String, Object?>();
      matched += (data?['matched'] as num?)?.toInt() ?? 0;
    }
    return matched;
  }

  @override
  Future<void> remove() =>
      guardApiCall(() => _dio.delete<void>('/contacts/sync'));
}
