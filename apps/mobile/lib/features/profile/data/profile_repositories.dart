import 'package:dio/dio.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/profile/data/profile_mappers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Resource-creating POSTs: IdempotencyInterceptor stamps an
/// Idempotency-Key (review create is REQUIRED to carry one, docs/03 §7.2).
const Map<String, dynamic> _createsResource = {
  RequestFlags.createsResource: true
};

/// docs/03 §4 attorney profiles (`/attorneys/*`). Throws [ApiException].
abstract interface class AttorneyProfileRepository {
  /// `GET /attorneys/:username` — 404 `NOT_FOUND` for unknown, suspended
  /// and client "usernames" alike (§4.2, §5).
  Future<PublicAttorneyProfile> fetchPublic(String username);

  Future<OwnAttorneyProfile> fetchOwn();

  Future<OwnAttorneyProfile> updateOwn(AttorneyProfilePatch patch);

  Future<UsernameCheck> checkUsername(String username);
}

/// docs/03 §3.2 practices. Throws [ApiException].
abstract interface class PracticesRepository {
  Future<List<PracticeCategory>> fetchTree();

  Future<List<SelectedPractice>> fetchSelected();

  /// Full replacement of the set; 403 `ATTORNEY_NOT_VERIFIED` before
  /// verification.
  Future<List<SelectedPractice>> replace(List<String> leafIds);
}

/// docs/03 §7 reviews. Throws [ApiException].
abstract interface class ReviewsRepository {
  /// [rating] 1–5: only reviews with that many stars (tap on the bar).
  Future<ReviewPage> list(String attorneyId,
      {String? cursor, int? rating, bool oldest = false});

  Future<ReviewSummary> summary(String attorneyId);

  /// `GET /cases/:caseId/review` — the caller's own review of that case,
  /// or null when there is none (404 NOT_FOUND).
  Future<Review?> ownForCase(String caseId);

  Future<Review> create(String caseId, {required int rating, String? body});

  Future<Review> update(String reviewId, {required int rating, String? body});

  Future<void> report(String reviewId, ReviewReportReason reason);
}

/// docs/03 §5 the client's private profile. Throws [ApiException].
abstract interface class ClientProfileRepository {
  Future<ClientProfileDetails> fetch();

  /// `GET /clients/:username` (OQ-026) — 404 `NOT_FOUND` for unknown or
  /// inactive clients.
  Future<PublicClientProfile> fetchPublic(String username);

  Future<ClientProfileDetails> update(ClientProfilePatch patch);

  /// `PATCH /users/me/contact-preferences`; a null [method] clears it.
  Future<ClientProfileDetails> updateContactPreferences({
    required ContactPreference? method,
    required String note,
  });
}

class ApiAttorneyProfileRepository implements AttorneyProfileRepository {
  ApiAttorneyProfileRepository(Dio dio) : _client = api.AttorneysClient(dio);

  final api.AttorneysClient _client;

  @override
  Future<PublicAttorneyProfile> fetchPublic(String username) async =>
      ProfileMappers.publicProfile(
        (await guardApiCall(
                () => _client.getAttorneyProfile(username: username)))
            .data,
      );

  @override
  Future<OwnAttorneyProfile> fetchOwn() async => ProfileMappers.ownProfile(
        (await guardApiCall(_client.getMyAttorneyProfile)).data,
      );

  @override
  Future<OwnAttorneyProfile> updateOwn(AttorneyProfilePatch patch) async {
    final body = api.UpdateAttorneyProfileDto(
      firstName: patch.firstName?.trim(),
      lastName: patch.lastName?.trim(),
      bio: patch.bio?.trim(),
      firmName: patch.firmName?.trim(),
      firms: patch.firms,
      username: patch.username?.trim(),
      languages: patch.languages
          ?.map(api.UpdateAttorneyProfileDtoLanguages.fromJson)
          .toList(growable: false),
    );
    return ProfileMappers.ownProfile(
      (await guardApiCall(() => _client.updateMyAttorneyProfile(body: body)))
          .data,
    );
  }

  @override
  Future<UsernameCheck> checkUsername(String username) async =>
      ProfileMappers.username(
        (await guardApiCall(() => _client.checkUsernameAvailable(u: username)))
            .data,
      );
}

class ApiPracticesRepository implements PracticesRepository {
  ApiPracticesRepository(Dio dio)
      : _tree = api.PracticeAreasClient(dio),
        _attorneys = api.AttorneysClient(dio);

  final api.PracticeAreasClient _tree;
  final api.AttorneysClient _attorneys;

  @override
  Future<List<PracticeCategory>> fetchTree() async =>
      (await guardApiCall(() => _tree.listPracticeAreas()))
          .data
          .map(ProfileMappers.category)
          .toList(growable: false);

  @override
  Future<List<SelectedPractice>> fetchSelected() async =>
      (await guardApiCall(_attorneys.getMyPracticeAreas))
          .data
          .map(ProfileMappers.selected)
          .toList(growable: false);

  @override
  Future<List<SelectedPractice>> replace(List<String> leafIds) async =>
      (await guardApiCall(
        () => _attorneys.replaceMyPracticeAreas(
          body: api.ReplacePracticeAreasDto(practiceAreaIds: leafIds),
        ),
      ))
          .data
          .map(ProfileMappers.selected)
          .toList(growable: false);
}

class ApiReviewsRepository implements ReviewsRepository {
  ApiReviewsRepository(Dio dio) : _client = api.ReviewsClient(dio);

  final api.ReviewsClient _client;

  /// Page size of the reviews tab.
  static const pageSize = 20;

  @override
  Future<ReviewPage> list(String attorneyId,
      {String? cursor, int? rating, bool oldest = false}) async {
    final env = await guardApiCall(
      () => _client.list(
        id: attorneyId,
        limit: pageSize,
        cursor: cursor,
        rating: rating,
        sort: oldest ? api.Sort4.oldest : api.Sort4.newest,
      ),
    );
    return ReviewPage(
      items: env.data.map(ProfileMappers.publicReview).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<ReviewSummary> summary(String attorneyId) async =>
      ProfileMappers.summary(
          (await guardApiCall(() => _client.summary(id: attorneyId))).data);

  @override
  Future<Review?> ownForCase(String caseId) async {
    try {
      return ProfileMappers.ownReview(
        (await guardApiCall(() => _client.getForCase(caseId: caseId))).data,
      );
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.notFound) return null;
      rethrow;
    }
  }

  @override
  Future<Review> create(String caseId,
          {required int rating, String? body}) async =>
      ProfileMappers.ownReview(
        (await guardApiCall(
          () => _client.create(
            caseId: caseId,
            body: api.CreateReviewDto(rating: rating, body: _text(body)),
            extras: _createsResource,
          ),
        ))
            .data,
      );

  @override
  Future<Review> update(String reviewId,
          {required int rating, String? body}) async =>
      ProfileMappers.ownReview(
        (await guardApiCall(
          () => _client.update(
            id: reviewId,
            body: api.UpdateReviewDto(rating: rating, body: body?.trim() ?? ''),
          ),
        ))
            .data,
      );

  @override
  Future<void> report(String reviewId, ReviewReportReason reason) =>
      guardApiCall(
        () => _client.report(
          id: reviewId,
          body: api.ReportReviewDto(
              reason: api.ReportReason.fromJson(reason.name)),
          extras: _createsResource,
        ),
      );

  static String? _text(String? body) {
    final trimmed = body?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }
}

class ApiClientProfileRepository implements ClientProfileRepository {
  ApiClientProfileRepository(Dio dio)
      : _dio = dio,
        _client = api.ProfilesClient(dio),
        _clients = api.ClientsClient(dio);

  final Dio _dio;
  final api.ProfilesClient _client;
  final api.ClientsClient _clients;

  @override
  Future<ClientProfileDetails> fetch() async => ProfileMappers.client(
      (await guardApiCall(_client.getMyClientProfile)).data);

  @override
  Future<PublicClientProfile> fetchPublic(String username) async =>
      ProfileMappers.publicClient(
        (await guardApiCall(
                () => _clients.getClientProfile(username: username)))
            .data,
      );

  @override
  Future<ClientProfileDetails> update(ClientProfilePatch patch) async {
    final body = api.UpdateClientProfileDto(
      firstName: patch.firstName?.trim(),
      lastName: patch.lastName?.trim(),
      username: patch.username?.trim(),
      stateCode: patch.stateCode,
      languages: patch.languages
          ?.map(api.UpdateClientProfileDtoLanguages.fromJson)
          .toList(growable: false),
      contactMethod: patch.contactMethod == null
          ? null
          : api.UpdateClientProfileDtoContactMethod.fromJson(
              patch.contactMethod!.wire),
      contactNote: patch.contactNote?.trim(),
    );
    return ProfileMappers.client(
      (await guardApiCall(() => _client.updateMyClientProfile(body: body)))
          .data,
    );
  }

  /// Sent without the generated DTO: an explicit `contactMethod: null`
  /// clears the choice, and the generated models drop null fields (same
  /// reason as UsersApiClient.saveProfileStep).
  @override
  Future<ClientProfileDetails> updateContactPreferences({
    required ContactPreference? method,
    required String note,
  }) async {
    final response = await guardApiCall(
      () => _dio.patch<Map<String, dynamic>>(
        '/users/me/contact-preferences',
        data: {'contactMethod': method?.wire, 'contactNote': note.trim()},
      ),
    );
    return guardApiCall(
      () async => ProfileMappers.client(
          api.ClientProfileEnvelope.fromJson(response.data!).data),
    );
  }
}
