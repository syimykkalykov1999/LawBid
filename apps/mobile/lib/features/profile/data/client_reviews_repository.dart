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

  Future<CursorPage<ClientReview>> list(String clientId,
      {String? cursor}) async {
    final env = await guardApiCall(
      () => _api.listClientReviews(id: clientId, cursor: cursor),
    );
    return CursorPage(
      items: env.data.map(ProfileMappers.clientReview).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

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

class ClientReviewsNotifier extends PagedNotifier<ClientReview> {
  ClientReviewsNotifier(this.clientId);

  final String clientId;

  @override
  Future<CursorPage<ClientReview>> fetch(String? cursor) =>
      ref.read(clientReviewsRepositoryProvider).list(clientId, cursor: cursor);

  @override
  Object idOf(ClientReview item) => item.id;
}

final clientReviewsProvider = AsyncNotifierProvider.autoDispose
    .family<ClientReviewsNotifier, PaginatedList<ClientReview>, String>(
  ClientReviewsNotifier.new,
  retry: (_, __) => null,
);

final myClientReviewProvider =
    FutureProvider.autoDispose.family<ClientReview?, String>(
  (ref, caseId) => ref.watch(clientReviewsRepositoryProvider).mine(caseId),
  retry: (_, __) => null,
);
