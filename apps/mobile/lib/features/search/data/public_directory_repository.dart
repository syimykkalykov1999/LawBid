import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-22 (guest browsing, decision A1): the one list the API
/// serves without an account — `GET /public/directory/attorneys` (verified
/// attorneys, best first; the CDN keeps it an hour). A guest's feed and
/// search are built on it until the feed / search / profile endpoints
/// accept a request without a token.
@immutable
class PublicAttorney {
  const PublicAttorney({
    required this.username,
    required this.displayName,
    required this.ratingAvg,
    required this.ratingCount,
    required this.trustBadge,
    required this.practices,
    required this.states,
    this.bio,
    this.photoUrl,
    this.firmNames = const [],
    this.languages = const [],
  });

  final String username;
  final String displayName;
  final String? bio;
  final String? photoUrl;
  final List<String> firmNames;
  final List<String> languages;
  final double ratingAvg;
  final int ratingCount;

  /// Identity verified (the trust badge of docs/ATTORNEY_TRUST.md).
  final bool trustBadge;

  /// Practice names as the API wrote them (already in English; the guest
  /// list is public SEO data, not the i18n keys the signed-in app uses).
  final List<String> practices;

  /// Two-letter state codes of verified licences.
  final List<String> states;

  String get initials {
    final parts =
        displayName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    return parts.map((p) => p[0].toUpperCase()).take(2).join();
  }

  /// Local search over the public facts (name, @username, practice, state,
  /// firm) for the guest search screen.
  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return displayName.toLowerCase().contains(q) ||
        username.toLowerCase().contains(q) ||
        practices.any((p) => p.toLowerCase().contains(q)) ||
        states.any((s) => s.toLowerCase() == q) ||
        firmNames.any((f) => f.toLowerCase().contains(q));
  }
}

@immutable
class PublicAttorneyPage {
  const PublicAttorneyPage({required this.items, this.nextCursor});

  final List<PublicAttorney> items;
  final String? nextCursor;
}

/// Throws [ApiException].
// ignore: one_member_abstracts
abstract interface class PublicDirectoryRepository {
  Future<PublicAttorneyPage> attorneys({
    String? state,
    String? practice,
    String? cursor,
    int limit = 50,
  });
}

class ApiPublicDirectoryRepository implements PublicDirectoryRepository {
  ApiPublicDirectoryRepository(Dio dio) : _client = api.PublicClient(dio);

  final api.PublicClient _client;

  /// The CDN keeps the list an hour; the phone the same.
  static const cacheTtl = Duration(hours: 1);

  @override
  Future<PublicAttorneyPage> attorneys({
    String? state,
    String? practice,
    String? cursor,
    int limit = 50,
  }) async {
    final r = await guardApiCall(
      () => _client.listPublicAttorneys(
        limit: limit,
        state: state,
        practice: practice,
        cursor: cursor,
        extras: cacheFor(cacheTtl),
      ),
    );
    return PublicAttorneyPage(
      items: [for (final d in r.data) _attorney(d)],
      nextCursor: r.meta?.nextCursor,
    );
  }

  static PublicAttorney _attorney(api.PublicAttorneyDto d) => PublicAttorney(
        username: d.username,
        displayName: d.displayName,
        bio: d.bio,
        photoUrl: d.photoUrl,
        firmNames: d.firmNames,
        languages: d.languages,
        ratingAvg: d.ratingAvg.toDouble(),
        ratingCount: d.ratingCount.toInt(),
        trustBadge: d.trustBadge,
        practices: [for (final p in d.practiceAreas) p.name],
        states: d.licensedStates,
      );
}
