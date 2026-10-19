import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

Duration? _noRetry(int retryCount, Object error) => null;

final searchRepositoryProvider = Provider<SearchRepository>(
  (ref) => ApiSearchRepository(ref.watch(dioProvider)),
);

/// docs/05 §7.1: at least 2 characters (a tag prefix needs 1 after '#').
const kSearchMinChars = 2;

/// The text as the server will read it (trimmed; '@'/'#' kept — the
/// server strips them).
String normalizeSearch(String raw) =>
    raw.trim().replaceAll(RegExp(r'\s+'), ' ');

/// Audit 2026-10-18: the server drops a leading '@'/'#' and then needs
/// [kSearchMinChars] letters ("@a" used to reach it and come back as a
/// "too short" error instead of waiting for the next letter). The Topics
/// tab keeps its own one-letter rule for '#x' (a tag prefix).
bool isSearchable(String raw, {bool tagPrefix = false}) {
  final q = normalizeSearch(raw);
  final bare = q.replaceFirst(RegExp('^[@#]+'), '').trim();
  if (tagPrefix && q.startsWith('#')) return bare.isNotEmpty;
  return bare.length >= kSearchMinChars;
}

/// Audit 2026-10-18: the Topics tab's practice rows for [query] (no '#'):
/// a category whose name in the app language, its English name or its tag
/// contains the text — or that the server names for it in ANY language
/// ("развод", "divorce", a subtopic's name → its category) via
/// [remoteCategories].
List<String> matchingPracticeCategories({
  required List<String> codes,
  required String query,
  required String Function(String code) localName,
  required String Function(String code) englishName,
  required String Function(String code) tag,
  Set<String> remoteCategories = const {},
}) {
  final q = query.toLowerCase().replaceAll('#', '').trim();
  if (q.isEmpty) return const [];
  return [
    for (final c in codes)
      if (localName(c).toLowerCase().contains(q) ||
          englishName(c).toLowerCase().contains(q) ||
          tag(c).contains(q) ||
          remoteCategories.contains(c))
        c,
  ];
}

/// Audit 2026-10-18: a client's own case matches [query] by title or by the
/// topic's names (any of [names]: app language, English, category) —
/// case-insensitive, every typed word must appear somewhere ("развод", "family
/// law", "divorce nyc"). Empty query matches everything.
bool myCaseMatches(String title, List<String> names, String query) {
  final words = query
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return true;
  final hay = '${title.toLowerCase()} ${names.join(' ').toLowerCase()}';
  return words.every(hay.contains);
}

typedef SearchKey = ({String q, SearchFilters filters});

/// OQ-026 People tab: attorneys and clients in one ranked list.
class PeopleSearchNotifier extends PagedNotifier<PersonRow> {
  PeopleSearchNotifier(this.key);

  final SearchKey key;

  @override
  Future<CursorPage<PersonRow>> fetch(String? cursor) => ref
      .read(searchRepositoryProvider)
      .people(key.q, key.filters, cursor: cursor);

  @override
  Object idOf(PersonRow item) => item.id;
}

final peopleSearchProvider = AsyncNotifierProvider.autoDispose
    .family<PeopleSearchNotifier, PaginatedList<PersonRow>, SearchKey>(
  PeopleSearchNotifier.new,
  retry: _noRetry,
);

class CaseSearchNotifier extends PagedNotifier<FeedCase> {
  CaseSearchNotifier(this.key);

  final SearchKey key;

  @override
  Future<CursorPage<FeedCase>> fetch(String? cursor) => ref
      .read(searchRepositoryProvider)
      .cases(key.q, key.filters, cursor: cursor);

  @override
  Object idOf(FeedCase item) => item.id;
}

final caseSearchProvider = AsyncNotifierProvider.autoDispose
    .family<CaseSearchNotifier, PaginatedList<FeedCase>, SearchKey>(
  CaseSearchNotifier.new,
  retry: _noRetry,
);

class PostSearchNotifier extends PagedNotifier<Post> {
  PostSearchNotifier(this.key);

  final SearchKey key;

  @override
  Future<CursorPage<Post>> fetch(String? cursor) => ref
      .read(searchRepositoryProvider)
      .posts(key.q, cursor: cursor, filters: key.filters);

  @override
  Object idOf(Post item) => item.id;
}

final postSearchProvider = AsyncNotifierProvider.autoDispose
    .family<PostSearchNotifier, PaginatedList<Post>, SearchKey>(
  PostSearchNotifier.new,
  retry: _noRetry,
);

final tagSearchProvider =
    FutureProvider.autoDispose.family<List<TagInfo>, String>(
  (ref, q) => ref.watch(searchRepositoryProvider).tags(q),
  retry: _noRetry,
);

/// §7.2 "Популярные темы" (server-side Redis list).
final trendingTagsProvider = FutureProvider.autoDispose<List<TagInfo>>(
  (ref) => ref.watch(searchRepositoryProvider).trending(),
  retry: _noRetry,
);

/// §7.2 recent searches: local, per account AND per Search tab (owner
/// 2026-10-18: people history = people searches only, posts history = posts
/// only…), clearable. The family key is the tab name (`SearchTab.name`).
class RecentSearches extends AsyncNotifier<List<String>> {
  RecentSearches(this.tab);

  final String tab;

  @override
  Future<List<String>> build() async {
    final owner = ref.watch(currentUserIdProvider);
    if (owner == null) return const [];
    final db = ref.watch(socialLocalDatabaseProvider);
    await db.dropLegacyRecent(owner);
    return db.recent(owner, tab);
  }

  Future<void> remember(String query) async {
    final owner = ref.read(currentUserIdProvider);
    final q = normalizeSearch(query);
    if (owner == null || !isSearchable(q, tagPrefix: tab == 'tags')) return;
    await ref.read(socialLocalDatabaseProvider).remember(owner, tab, q);
    ref.invalidateSelf();
  }

  Future<void> forget(String query) async {
    final owner = ref.read(currentUserIdProvider);
    if (owner == null) return;
    await ref.read(socialLocalDatabaseProvider).forgetRecent(owner, tab, query);
    ref.invalidateSelf();
  }

  Future<void> clear() async {
    final owner = ref.read(currentUserIdProvider);
    if (owner == null) return;
    await ref.read(socialLocalDatabaseProvider).clearRecent(owner, tab);
    state = const AsyncData([]);
  }
}

final recentSearchesProvider =
    AsyncNotifierProvider.family<RecentSearches, List<String>, String>(
  RecentSearches.new,
);

/// Owner 2026-10-15: suggestions for what is being typed (type-ahead); the
/// server caches them for a minute, the family key is the normalized text.
final searchSuggestionsProvider = FutureProvider.autoDispose
    .family<List<SearchSuggestion>, String>((ref, q) async {
  if (q.isEmpty) return const [];
  return ref.watch(searchRepositoryProvider).suggest(q);
});
