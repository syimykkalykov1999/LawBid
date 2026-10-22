import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';

/// Server state of the user's contacts sync.
class ContactsSyncStatus {
  const ContactsSyncStatus({
    required this.enabled,
    required this.matches,
    this.findByPhone = true,
    this.phoneRegion,
  });

  final bool enabled;
  final int matches;

  /// "Let people find me by my number" (clients).
  final bool findByPhone;

  /// ISO country of the account number — the default region for numbers in
  /// national format.
  final String? phoneRegion;
}

/// A phone-book number that belongs to a LawBid user ([hash] is the one the
/// app itself sent, so the phone-book name can be found locally).
class ContactPerson {
  const ContactPerson({
    required this.hash,
    required this.userId,
    required this.displayName,
    this.username,
    this.avatarUrl,
    this.role,
  });

  final String hash;
  final String userId;
  final String displayName;
  final String? username;
  final String? avatarUrl;

  /// `client`, `attorney` or `assistant`.
  final String? role;

  bool get isAttorney => role == 'attorney';
}

/// Answer of one upload: how many matched and who.
class ContactsUploadResult {
  const ContactsUploadResult({required this.matched, required this.people});

  final int matched;
  final List<ContactPerson> people;
}

/// Owner 2026-10-13: `/contacts/sync`. Only
/// SHA-256 hashes of phone numbers are sent (see phone_numbers.dart).
// TODO(contract): switch to the generated ContactsSyncClient once
// packages/api-contract/generate.sh has been run for the new endpoints.
abstract interface class ContactsSyncRepository {
  Future<ContactsSyncStatus> status();

  /// Uploads [hashes] in chunks; returns who belongs to LawBid.
  Future<ContactsUploadResult> upload(Set<String> hashes);

  /// Turns the sync off and deletes every match.
  Future<void> remove();

  Future<void> setFindByPhone({required bool enabled});
}

class ApiContactsSyncRepository implements ContactsSyncRepository {
  ApiContactsSyncRepository(this._dio);

  final Dio _dio;

  /// The load balancer's firewall refuses bodies over 8 KB (a hash is ~68
  /// bytes in JSON): 100 hashes stay near 7 KB. Prod 2026-10-21: 2000 per
  /// request answered 403 before the API saw it. The server's own cap
  /// (CONTACT_HASHES_MAX) is higher.
  static const chunkSize = 100;

  @override
  Future<ContactsSyncStatus> status() async {
    final res = await guardApiCall(
      () => _dio.get<Map<String, Object?>>('/contacts/sync'),
    );
    final data = (res.data?['data'] as Map?)?.cast<String, Object?>();
    return ContactsSyncStatus(
      enabled: data?['enabled'] == true,
      matches: (data?['matches'] as num?)?.toInt() ?? 0,
      findByPhone: data?['findByPhone'] != false,
      phoneRegion: data?['phoneRegion'] as String?,
    );
  }

  @override
  Future<ContactsUploadResult> upload(Set<String> hashes) async {
    final all = hashes.toList(growable: false);
    var matched = 0;
    final people = <ContactPerson>[];
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
      for (final raw in (data?['people'] as List?) ?? const []) {
        final m = (raw as Map).cast<String, Object?>();
        final id = m['userId'] as String?;
        final hash = m['hash'] as String?;
        if (id == null || hash == null) continue;
        people.add(
          ContactPerson(
            hash: hash,
            userId: id,
            displayName: (m['displayName'] as String?) ?? '',
            username: m['username'] as String?,
            avatarUrl: m['avatarUrl'] as String?,
            role: m['role'] as String?,
          ),
        );
      }
    }
    return ContactsUploadResult(matched: matched, people: people);
  }

  @override
  Future<void> remove() =>
      guardApiCall(() => _dio.delete<void>('/contacts/sync'));

  @override
  Future<void> setFindByPhone({required bool enabled}) => guardApiCall(
        () => _dio.put<void>(
          '/contacts/sync/find-by-phone',
          data: {'enabled': enabled},
        ),
      );
}
