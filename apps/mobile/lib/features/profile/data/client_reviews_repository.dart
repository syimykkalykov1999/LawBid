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

  Future<CursorPage<ClientReview>> list(
    String clientId, {
    String? cursor,
    int? rating,
    bool oldest = false,
  }) async {
    final env = await guardApiCall(
      () => _api.listClientReviews(
        id: clientId,
        cursor: cursor,
        rating: rating,
        sort: oldest
            ? api.ClientReviewsSort.oldest
            : api.ClientReviewsSort.newest,
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
          {required int rating, String? body}) async =>
      ProfileMappers.clientReview(
        (await guardApiCall(
          () => _api.upsertClientReview(
            id: caseId,
            body: api.UpsertClientReviewDto(
              rating: rating,
              body: (body ?? '').trim().isEmpty ? null : body!.trim(),
            ),
          ),
        ))
            .data,
      );
}

final clientReviewsRepositoryProvider = Provider<ClientReviewsRepository>(
  (ref) => ClientReviewsRepository(ref.watch(dioProvider)),
);

/// Which client's reviews, filtered by stars and ordered by date — the
/// same controls as the attorney's Reviews tab (owner 2026-09-30).
typedef ClientReviewsKey = ({String clientId, int? rating, bool oldest});

class ClientReviewsNotifier extends PagedNotifier<ClientReview> {
  ClientReviewsNotifier(this.key);

  final ClientReviewsKey key;

  @override
  Future<CursorPage<ClientReview>> fetch(String? cursor) =>
      ref.read(clientReviewsRepositoryProvider).list(
            key.clientId,
            cursor: cursor,
            rating: key.rating,
            oldest: key.oldest,
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
