import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/social/domain/post_insights_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// What the app reports for a post's statistics.
enum PostEventKind {
  impression('impression'),
  profileVisit('profile_visit'),

  /// Owner 2026-10-22 (client economy plan, package A): a view, batched
  /// with the others instead of `POST /posts/{id}/view`.
  view('view');

  const PostEventKind(this.wire);

  /// The server's name of the kind (also the disk queue's).
  final String wire;

  static PostEventKind? fromWire(String wire) {
    for (final k in values) {
      if (k.wire == wire) return k;
    }
    return null;
  }
}

/// Owner 2026-10-18 — `GET /posts/:id/insights` (the author only) and
/// `POST /posts/events` (impressions and profile visits, in batches).
class PostInsightsRepository {
  PostInsightsRepository(Dio dio) : _posts = api.PostsClient(dio);

  final api.PostsClient _posts;

  Future<PostInsights> insights(String postId) async {
    final d = (await guardApiCall(
      () => _posts.postInsights(
        id: postId,
        tzOffset: DateTime.now().timeZoneOffset.inMinutes,
      ),
    ))
        .data;
    return PostInsights(
      postId: d.postId,
      publishedAt: d.publishedAt.toLocal(),
      totals: _counts(d.totals),
      reachFollowers: d.reachFollowers,
      reachNonFollowers: d.reachNonFollowers,
      days: [
        for (final x in d.days)
          InsightsDay(
            date: DateTime(x.date.year, x.date.month, x.date.day),
            counts: InsightsCounts(
              impressions: x.impressions,
              reach: x.reach,
              views: x.views,
              likes: x.likes,
              comments: x.comments,
              saves: x.saves,
              reposts: x.reposts,
              shares: x.shares,
              profileVisits: x.profileVisits,
            ),
          ),
      ],
    );
  }

  Future<void> record(List<(String, PostEventKind)> events) async {
    if (events.isEmpty) return;
    await guardApiCall(
      () => _posts.recordPostEvents(
        body: api.RecordPostEventsDto(
          events: [
            for (final (id, kind) in events)
              api.PostEventItemDto(
                postId: id,
                kind: switch (kind) {
                  PostEventKind.impression =>
                    api.PostEventItemDtoKind.impression,
                  PostEventKind.profileVisit =>
                    api.PostEventItemDtoKind.profileVisit,
                  PostEventKind.view => api.PostEventItemDtoKind.view,
                },
              ),
          ],
        ),
      ),
    );
  }

  static InsightsCounts _counts(api.PostInsightsCountsDto c) => InsightsCounts(
        impressions: c.impressions,
        reach: c.reach,
        views: c.views,
        likes: c.likes,
        comments: c.comments,
        saves: c.saves,
        reposts: c.reposts,
        shares: c.shares,
        profileVisits: c.profileVisits,
      );
}
