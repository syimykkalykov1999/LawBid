import 'dart:math' as math;

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
  const ContactsUploadResult({
    required this.matched,
    required this.people,
    this.uploaded = const {},
    this.limited = false,
  });

  final int matched;
  final List<ContactPerson> people;

  /// The hashes the server has seen (all of them unless [limited]).
  final Set<String> uploaded;

  /// The server's limit (429) stopped the upload part-way: [people] is what
  /// came back before it.
  final bool limited;
}

/// Called with everything received so far after each part (one call when
/// the whole book goes up in one request).
typedef ContactsUploadProgress = void Function(ContactsUploadResult soFar);

/// Owner 2026-10-13: `/contacts/sync`. Only
/// SHA-256 hashes of phone numbers are sent (see phone_numbers.dart).
// TODO(contract): switch to the generated ContactsSyncClient once
// packages/api-contract/generate.sh has been run for the new endpoints.
abstract interface class ContactsSyncRepository {
  Future<ContactsSyncStatus> status();

  /// Uploads [hashes] (the whole book in one request, parts only when the
  /// firewall refuses a big body); returns who belongs to LawBid. A 429 is
  /// not thrown: the result is [ContactsUploadResult.limited].
  Future<ContactsUploadResult> upload(
    Set<String> hashes, {
    ContactsUploadProgress? onProgress,
  });

  /// Turns the sync off and deletes every match.
  Future<void> remove();

  Future<void> setFindByPhone({required bool enabled});
}

class ApiContactsSyncRepository implements ContactsSyncRepository {
  ApiContactsSyncRepository(this._dio);

  final Dio _dio;

  /// Owner 2026-10-22: the whole phone book goes up in ONE request (the
  /// server takes up to CONTACT_HASHES_MAX = 10 000 hashes; the firewall
  /// exempts this path, infra/modules/alb). Bigger books go in parts of
  /// this size.
  static const maxPerRequest = 10000;

  /// Fallback only: when the load balancer's firewall refuses the big body
  /// (403, or 413) — e.g. before the WAF exemption is applied — the book
  /// goes in parts of 100 hashes (~7 KB, under its 8 KB rule).
  static const fallbackChunkSize = 100;

  /// Set after the firewall refused a big body once: the rest of this app
  /// session goes straight to small parts.
  bool _smallParts = false;

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
      findByPhone: data?['findByPhone'] != false,
      phoneRegion: data?['phoneRegion'] as String?,
    );
  }

  @override
  Future<ContactsUploadResult> upload(
    Set<String> hashes, {
    ContactsUploadProgress? onProgress,
  }) async {
    final all = hashes.toList(growable: false);
    var matched = 0;
    final people = <ContactPerson>[];
    final uploaded = <String>{};
    ContactsUploadResult soFar({bool limited = false}) => ContactsUploadResult(
          matched: matched,
          people: List.unmodifiable(people),
          uploaded: Set.unmodifiable(uploaded),
          limited: limited,
        );
    var size = _smallParts ? fallbackChunkSize : maxPerRequest;
    var i = 0;
    while (i < all.length) {
      final part = all.sublist(i, math.min(i + size, all.length));
      final Response<Map<String, Object?>> res;
      try {
        res = await guardApiCall(
          () => _dio.post<Map<String, Object?>>(
            '/contacts/sync',
            data: {'hashes': part},
          ),
        );
      } on ApiException catch (e) {
        final firewall = e.statusCode == 403 || e.statusCode == 413;
        if (firewall && size > fallbackChunkSize) {
          // The same part again, smaller.
          _smallParts = true;
          size = fallbackChunkSize;
          continue;
        }
        if (e.statusCode == 429) return soFar(limited: true);
        rethrow;
      }
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
      uploaded.addAll(part);
      i += part.length;
      onProgress?.call(soFar());
    }
    return soFar();
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
