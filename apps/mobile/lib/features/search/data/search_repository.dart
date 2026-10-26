import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show listEquals;
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
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
    this.budgetPercent = false,
    this.percentMax,
    this.noBids = false,
    this.minUrgency,
    this.hasDeadline = false,
    this.caseStatus,
    this.withPhotos = false,
    this.briefsOnly = false,
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

  /// Owner 2026-10-18: also cases with a percent (contingency) budget, up
  /// to [percentMax] whole percent when set; OR-ed with the other budget
  /// options.
  final bool budgetPercent;
  final int? percentMax;
  final bool noBids;

  /// Owner 2026-10-05: at least this urgent (`soon` · `urgent` ·
  /// `very_urgent`), and only cases with a date still ahead.
  final String? minUrgency;
  final bool hasDeadline;

  /// My cases (client).
  final MyCasesFilter? caseStatus;

  /// Posts.
  final bool withPhotos;

  /// Owner 2026-10-13: only text-only posts (Briefs).
  final bool briefsOnly;
  final PostSort postSort;

  /// Topics.
  final TopicKind topicKind;
  final TopicSort topicSort;

  /// The same filters with only "Briefs" changed.
  SearchFilters withBriefsOnly({required bool value}) => SearchFilters(
        practiceAreaId: practiceAreaId,
        practiceLabel: practiceLabel,
        state: state,
        minRating: minRating,
        language: language,
        period: period,
        role: role,
        verifiedOnly: verifiedOnly,
        practiceCategory: practiceCategory,
        budgetMin: budgetMin,
        budgetMax: budgetMax,
        budgetUnknown: budgetUnknown,
        budgetPercent: budgetPercent,
        percentMax: percentMax,
        noBids: noBids,
        minUrgency: minUrgency,
        hasDeadline: hasDeadline,
        caseStatus: caseStatus,
        withPhotos: withPhotos,
        briefsOnly: value,
        postSort: postSort,
        topicKind: topicKind,
        topicSort: topicSort,
      );

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
        if (budgetPercent) true,
        if (noBids) true,
        minUrgency,
        if (hasDeadline) true,
        caseStatus,
        if (withPhotos) true,
        if (briefsOnly) true,
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
        budgetPercent,
        percentMax,
        noBids,
        minUrgency,
        hasDeadline,
        caseStatus,
        withPhotos,
        briefsOnly,
        postSort,
        topicKind,
        topicSort,
      ];

  @override
  // ignore: avoid_equals_and_hash_code_on_mutable_classes
  bool operator ==(Object other) =>
      other is SearchFilters && listEquals(other._props, _props);

  @override
  // ignore: avoid_equals_and_hash_code_on_mutable_classes
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

  /// Owner 2026-10-15: type-ahead — topics, attorney handles and practice
  /// names starting with [q].
  /// [cancel]: the typing moved on — the request is dropped (package K).
  Future<List<SearchSuggestion>> suggest(String q, {CancelToken? cancel});

  /// Owner 2026-10-15: the person opened a result of [q] — the search
  /// learns "query → topic" from it. Never throws and never waits.
  void opened(String q, SearchOpened type, String id);
}

enum SearchOpened { valueCase, post, attorney, practice }

enum SuggestionKind { tag, person, practice }

class SearchSuggestion {
  const SearchSuggestion(this.kind, this.text);

  final SuggestionKind kind;
  final String text;
}

class ApiSearchRepository implements SearchRepository {
  ApiSearchRepository(Dio dio, {this.guest = false})
      : _dio = dio,
        _search = api.SearchClient(dio);

  final Dio _dio;

  /// Owner 2026-10-22 (guest browsing): no account — nothing to record.
  final bool guest;

  @override
  Future<List<SearchSuggestion>> suggest(
    String q, {
    CancelToken? cancel,
  }) async {
    final env = await guardApiCall(
      () async => api.SuggestionListEnvelope.fromJson(
        (await _dio.get<Map<String, dynamic>>(
          '/search/suggest',
          queryParameters: {'q': q},
          cancelToken: cancel,
        ))
            .data!,
      ),
    );
    return [
      for (final s in env.data)
        SearchSuggestion(
          switch (s.kind.json) {
            'tag' => SuggestionKind.tag,
            'person' => SuggestionKind.person,
            _ => SuggestionKind.practice,
          },
          s.text,
        ),
    ];
  }

  final api.SearchClient _search;

  @override
  void opened(String q, SearchOpened type, String id) {
    final query = q.trim();
    if (guest || query.length < 3) return;
    unawaited(
      _search
          .click(
            body: api.SearchClickDto(
              q: query.length > 100 ? query.substring(0, 100) : query,
              targetType: switch (type) {
                SearchOpened.valueCase =>
                  api.SearchClickDtoTargetType.valueCase,
                SearchOpened.post => api.SearchClickDtoTargetType.post,
                SearchOpened.attorney => api.SearchClickDtoTargetType.attorney,
                SearchOpened.practice => api.SearchClickDtoTargetType.practice,
              },
              targetId: id,
            ),
          )
          .then<void>((_) {}, onError: (Object _) {}),
    );
  }

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
        budgetPercent: f.budgetPercent ? true : null,
        percentMax: f.budgetPercent ? f.percentMax : null,
        noBids: f.noBids ? true : null,
        minUrgency: f.minUrgency == null
            ? null
            : api.MinUrgency.fromJson(f.minUrgency!),
        hasDeadline: f.hasDeadline ? true : null,
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
        // Audit 2026-10-01: posts of the qualification (and its
        // subcategories); the topic hashtag catches older posts.
        practice: f.practiceCategory,
        tag: f.practiceCategory == null
            ? null
            : topicTagFor(f.practiceCategory!.split('.').first),
        state: f.state,
        withPhotos: f.withPhotos ? true : null,
        briefsOnly: f.briefsOnly ? true : null,
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
          .map(
            (d) => TagInfo(
              tag: d.tag,
              postsCount: d.postsCount?.toInt(),
              categoryCode: d.categoryCode,
            ),
          )
          .toList();

  @override
  Future<List<TagInfo>> trending() async => (await guardApiCall(
        () => _search.trending(extras: cacheFor(const Duration(minutes: 10))),
      ))
          .data
          .map(
            (d) => TagInfo(
              tag: d.tag,
              postsCount: d.postsCount?.toInt(),
              categoryCode: d.categoryCode,
            ),
          )
          .toList();
}
