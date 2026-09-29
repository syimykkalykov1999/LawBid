import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/data/cases_mappers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/social/data/social_repository.dart'
    show SocialMappers;
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// docs/05 §7.4 publication window of the case search.
enum SearchPeriod { day, week, month, all }

/// docs/05 §7.3 / §7.4 filters (null = any).
class SearchFilters {
  const SearchFilters({
    this.practiceAreaId,
    this.practiceLabel,
    this.state,
    this.minRating,
    this.language,
    this.period = SearchPeriod.all,
  });

  final String? practiceAreaId;

  /// For the chip only; never sent.
  final String? practiceLabel;
  final String? state;
  final double? minRating;
  final String? language;
  final SearchPeriod period;

  int get activeCount => [
        practiceAreaId,
        state,
        minRating,
        language,
        if (period != SearchPeriod.all) period,
      ].whereType<Object>().length;

  @override
  bool operator ==(Object other) =>
      other is SearchFilters &&
      other.practiceAreaId == practiceAreaId &&
      other.state == state &&
      other.minRating == minRating &&
      other.language == language &&
      other.period == period;

  @override
  int get hashCode =>
      Object.hash(practiceAreaId, state, minRating, language, period);
}

/// docs/05 §7 search API for the app. Throws [ApiException].
abstract interface class SearchRepository {
  Future<CursorPage<AttorneyRow>> attorneys(String q, SearchFilters f,
      {String? cursor,});
  Future<CursorPage<FeedCase>> cases(String q, SearchFilters f,
      {String? cursor,});
  Future<CursorPage<Post>> posts(String q, {String? cursor});
  Future<List<TagInfo>> tags(String q);
  Future<List<TagInfo>> trending();
}

class ApiSearchRepository implements SearchRepository {
  ApiSearchRepository(Dio dio) : _search = api.SearchClient(dio);

  final api.SearchClient _search;

  @override
  Future<CursorPage<AttorneyRow>> attorneys(String q, SearchFilters f,
      {String? cursor,}) async {
    final env = await guardApiCall(() => _search.attorneys(
          q: q,
          cursor: cursor,
          practiceAreaId: f.practiceAreaId,
          state: f.state,
          minRating: f.minRating,
          language: f.language,
        ),);
    return CursorPage(
      items: env.data.map(SocialMappers.attorney).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<FeedCase>> cases(String q, SearchFilters f,
      {String? cursor,}) async {
    final env = await guardApiCall(() => _search.cases(
          q: q,
          cursor: cursor,
          practiceAreaId: f.practiceAreaId,
          state: f.state,
          period: switch (f.period) {
            SearchPeriod.day => api.Period.value24h,
            SearchPeriod.week => api.Period.value7d,
            SearchPeriod.month => api.Period.value30d,
            SearchPeriod.all => api.Period.all,
          },
        ),);
    return CursorPage(
      items: env.data.map(CasesMappers.feedCase).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<Post>> posts(String q, {String? cursor}) async {
    final env = await guardApiCall(() => _search.posts(q: q, cursor: cursor));
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<List<TagInfo>> tags(String q) async =>
      (await guardApiCall(() => _search.tags(q: q)))
          .data
          .map((d) => TagInfo(tag: d.tag, postsCount: d.postsCount?.toInt()))
          .toList();

  @override
  Future<List<TagInfo>> trending() async =>
      (await guardApiCall(_search.trending))
          .data
          .map((d) => TagInfo(tag: d.tag, postsCount: d.postsCount?.toInt()))
          .toList();
}
