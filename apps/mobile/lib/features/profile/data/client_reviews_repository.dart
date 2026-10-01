import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/profile/data/profile_mappers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// OQ-038: attorneys' reviews of clients.
class ClientReviewsRepository {
  ClientReviewsRepository(Dio dio) : _api = api.ClientReviewsClient(dio);

  final api.ClientReviewsClient _api;

  api.ClientReviewsClient get client => _api;

  Future<CursorPage<ClientReview>> list(
    String clientId, {
    String? cursor,
    int? rating,
    ReviewsSort sort = ReviewsSort.newest,
  }) async {
    final env = await guardApiCall(
      () => _api.listClientReviews(
        id: clientId,
        cursor: cursor,
        rating: rating,
        sort: api.ClientReviewsSort.fromJson(sort.wire),
      ),
    );
    return CursorPage(
      items: env.data.map(ProfileMappers.clientReview).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  /// Average, count and 5 → 1 distribution (the Reviews tab header).
  Future<ReviewSummary> summary(String clientId) async =>
      ProfileMappers.summary(
        (await guardApiCall(() => _api.clientReviewsSummary(id: clientId)))
            .data,
      );

  /// The caller's own review of the case client; null when none yet (the
  /// API answers `data: null`, which the generated envelope cannot parse).
  Future<ClientReview?> mine(String caseId) async {
    try {
      final env = await guardApiCall(() => _api.getMyClientReview(id: caseId));
      return ProfileMappers.clientReview(env.data);
    } on Object {
      return null;
    }
  }

  Future<ClientReview> save(String caseId,
          {required int rating,
          String? body,
          List<String>? photoIds}) async =>
      ProfileMappers.clientReview(
        (await guardApiCall(
          () => _api.upsertClientReview(
            id: caseId,
            body: api.UpsertClientReviewDto(
              rating: rating,
              body: (body ?? '').trim().isEmpty ? null : body!.trim(),
              photoIds: photoIds,
            ),
          ),
        ))
            .data,
      );
}

extension OpenClientReviews on ClientReviewsRepository {
  /// Owner 2026-09-30: anyone reviews a client once (an edit replaces it).
  Future<ClientReview> saveOpen(String clientId,
          {required int rating,
          String? body,
          List<String>? photoIds}) async =>
      ProfileMappers.clientReview(
        (await guardApiCall(
          () => client.upsertOpenClientReview(
            id: clientId,
            body: api.UpsertClientReviewDto(
              rating: rating,
              body: (body ?? '').trim().isEmpty ? null : body!.trim(),
              photoIds: photoIds,
            ),
          ),
        ))
            .data,
      );

  /// My review of that client, or null.
  Future<ClientReview?> mineFor(String clientId) async {
    try {
      final env =
          await guardApiCall(() => client.getMyOpenClientReview(id: clientId));
      return ProfileMappers.clientReview(env.data);
    } on Object {
      return null;
    }
  }

  Future<void> delete(String reviewId) =>
      guardApiCall(() => client.deleteClientReview(id: reviewId));

  /// Owner 2026-10-01 (Google-style): the reviewed person replies
  /// publicly (null removes the reply).
  Future<ClientReview> reply(String reviewId, String? body) async =>
      ProfileMappers.clientReview((await guardApiCall(() => body == null
              ? client.deleteClientReviewReply(id: reviewId)
              : client.replyToClientReview(
                  id: reviewId,
                  body: api.ReviewReplyDto(body: body.trim()),
                )))
          .data);

  Future<ClientReview> helpful(String reviewId, {required bool on}) async =>
      ProfileMappers.clientReview((await guardApiCall(
              () => client.markClientReviewHelpful(
                    id: reviewId,
                    body: api.ReviewHelpfulDto(helpful: on),
                  )))
          .data);

  /// Flag against the policy → admin moderation.
  Future<void> report(String reviewId, ReviewReportReason reason,
          {String? note}) =>
      guardApiCall(() => client.reportClientReview(
            id: reviewId,
            body: api.ReportReviewDto(
              reason: api.ReportReason.fromJson(reason.wire),
              note: note,
            ),
          ));
}

final clientReviewsRepositoryProvider = Provider<ClientReviewsRepository>(
  (ref) => ClientReviewsRepository(ref.watch(dioProvider)),
);

/// Which client's reviews, filtered by stars and ordered by date — the
/// same controls as the attorney's Reviews tab (owner 2026-09-30).
typedef ClientReviewsKey = ({
  String clientId,
  int? rating,
  ReviewsSort sort,
});

class ClientReviewsNotifier extends PagedNotifier<ClientReview> {
  ClientReviewsNotifier(this.key);

  final ClientReviewsKey key;

  @override
  Future<CursorPage<ClientReview>> fetch(String? cursor) =>
      ref.read(clientReviewsRepositoryProvider).list(
            key.clientId,
            cursor: cursor,
            rating: key.rating,
            sort: key.sort,
          );

  @override
  Object idOf(ClientReview item) => item.id;
}

final clientReviewsProvider = AsyncNotifierProvider.autoDispose.family<
    ClientReviewsNotifier, PaginatedList<ClientReview>, ClientReviewsKey>(
  ClientReviewsNotifier.new,
  retry: (_, __) => null,
);

final clientReviewSummaryProvider =
    FutureProvider.autoDispose.family<ReviewSummary, String>(
  (ref, clientId) =>
      ref.watch(clientReviewsRepositoryProvider).summary(clientId),
  retry: (_, __) => null,
);

final myClientReviewProvider =
    FutureProvider.autoDispose.family<ClientReview?, String>(
  (ref, caseId) => ref.watch(clientReviewsRepositoryProvider).mine(caseId),
  retry: (_, __) => null,
);

/// My review of a client (the profile's "Write a review" / "Edit").
final myOpenClientReviewProvider =
    FutureProvider.autoDispose.family<ClientReview?, String>(
  (ref, clientId) =>
      ref.watch(clientReviewsRepositoryProvider).mineFor(clientId),
  retry: (_, __) => null,
);
