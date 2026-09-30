import 'package:flutter/foundation.dart' show listEquals;
import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/data/cases_mappers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart'
    show topicTagFor;
import 'package:lawbid/features/social/data/social_repository.dart'
    show SocialMappers;
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// docs/05 §7.4 publication window of the case search.
enum SearchPeriod { day, week, month, all }

/// OQ-036: which Search tab a filter set belongs to.
enum SearchFilterKind { people, cases, myCases, posts, topics }

enum PostSort { relevance, newest, popular }

enum TopicKind { all, practices, hashtags }

enum TopicSort { popular, az }

/// Owner 2026-09-30 (OQ-036): every Search tab has its own filters (null /
/// false = any). People: role, state, practice, rating, language, only
/// verified. Cases: practice area, state, posted, budget range, "clarify
/// later", no bids yet. My cases (client): status, practice area. Posts:
/// topic, author's state, posted, with photos, sort. Topics: kind, sort.
class SearchFilters {
  const SearchFilters({
    this.practiceAreaId,
    this.practiceLabel,
    this.state,
    this.minRating,
    this.language,
    this.period = SearchPeriod.all,
    this.role,
    this.verifiedOnly = false,
    this.practiceCategory,
    this.budgetMin,
    this.budgetMax,
    this.budgetUnknown = false,
    this.noBids = false,
    this.caseStatus,
    this.withPhotos = false,
    this.postSort = PostSort.relevance,
    this.topicKind = TopicKind.all,
    this.topicSort = TopicSort.popular,
  });

  final String? practiceAreaId;

  /// For the chip only; never sent.
  final String? practiceLabel;
  final String? state;
  final double? minRating;
  final String? language;
  final SearchPeriod period;

  /// People: 'attorney' / 'client' (null = everyone).
  final String? role;
  final bool verifiedOnly;

  /// Cases / My cases / Posts (as its topic): a practice category code.
  final String? practiceCategory;

  /// Cases: whole dollars.
  final int? budgetMin;
  final int? budgetMax;
  final bool budgetUnknown;
  final bool noBids;

  /// My cases (client).
  final MyCasesFilter? caseStatus;

  /// Posts.
  final bool withPhotos;
  final PostSort postSort;

  /// Topics.
  final TopicKind topicKind;
  final TopicSort topicSort;

  int get activeCount => [
        practiceAreaId,
        state,
        minRating,
        language,
        if (period != SearchPeriod.all) period,
        role,
        if (verifiedOnly) true,
        practiceCategory,
        if (budgetMin != null || budgetMax != null) true,
        if (budgetUnknown) true,
        if (noBids) true,
        caseStatus,
        if (withPhotos) true,
        if (postSort != PostSort.relevance) postSort,
        if (topicKind != TopicKind.all) topicKind,
        if (topicSort != TopicSort.popular) topicSort,
      ].whereType<Object>().length;

  List<Object?> get _props => [
        practiceAreaId,
        state,
        minRating,
        language,
        period,
        role,
        verifiedOnly,
        practiceCategory,
        budgetMin,
        budgetMax,
        budgetUnknown,
        noBids,
        caseStatus,
        withPhotos,
        postSort,
        topicKind,
        topicSort,
      ];

  @override
  bool operator ==(Object other) =>
      other is SearchFilters && listEquals(other._props, _props);

  @override
  int get hashCode => Object.hashAll(_props);
}

/// docs/05 §7 search API for the app. Throws [ApiException].
abstract interface class SearchRepository {
  Future<CursorPage<AttorneyRow>> attorneys(
    String q,
    SearchFilters f, {
    String? cursor,
  });

  /// OQ-026: attorneys AND clients by @username / name; any filter set
  /// narrows the list to attorneys.
  Future<CursorPage<PersonRow>> people(
    String q,
    SearchFilters f, {
    String? cursor,
  });
  Future<CursorPage<FeedCase>> cases(
    String q,
    SearchFilters f, {
    String? cursor,
  });
  Future<CursorPage<Post>> posts(
    String q, {
    String? cursor,
    SearchFilters filters = const SearchFilters(),
  });
  Future<List<TagInfo>> tags(String q);
  Future<List<TagInfo>> trending();
}

class ApiSearchRepository implements SearchRepository {
  ApiSearchRepository(Dio dio) : _search = api.SearchClient(dio);

  final api.SearchClient _search;

  @override
  Future<CursorPage<AttorneyRow>> attorneys(
    String q,
    SearchFilters f, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _search.attorneys(
        q: q,
        cursor: cursor,
        practiceAreaId: f.practiceAreaId,
        state: f.state,
        minRating: f.minRating,
        language: f.language,
      ),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.attorney).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<PersonRow>> people(
    String q,
    SearchFilters f, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _search.people(
        q: q,
        cursor: cursor,
        practiceAreaId: f.practiceAreaId,
        state: f.state,
        minRating: f.minRating,
        language: f.language,
        role: switch (f.role) {
          'attorney' => api.Role2.attorney,
          'client' => api.Role2.client,
          _ => null,
        },
        verifiedOnly: f.verifiedOnly ? true : null,
      ),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.person).whereType<PersonRow>().toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<FeedCase>> cases(
    String q,
    SearchFilters f, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _search.cases(
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
        practiceCategory: f.practiceCategory,
        budgetMin: f.budgetMin,
        budgetMax: f.budgetMax,
        budgetUnknown: f.budgetUnknown ? true : null,
        noBids: f.noBids ? true : null,
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.feedCase).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<Post>> posts(
    String q, {
    String? cursor,
    SearchFilters filters = const SearchFilters(),
  }) async {
    final f = filters;
    final env = await guardApiCall(
      () => _search.posts(
        q: q,
        cursor: cursor,
        tag: f.practiceCategory == null
            ? null
            : topicTagFor(f.practiceCategory!),
        state: f.state,
        withPhotos: f.withPhotos ? true : null,
        period: switch (f.period) {
          SearchPeriod.day => api.Period.value24h,
          SearchPeriod.week => api.Period.value7d,
          SearchPeriod.month => api.Period.value30d,
          SearchPeriod.all => api.Period.all,
        },
        sort: switch (f.postSort) {
          PostSort.relevance => api.Sort2.relevance,
          PostSort.newest => api.Sort2.newest,
          PostSort.popular => api.Sort2.popular,
        },
      ),
    );
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
