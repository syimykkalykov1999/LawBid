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

typedef SearchKey = ({String q, SearchFilters filters});

class AttorneySearchNotifier extends PagedNotifier<AttorneyRow> {
  AttorneySearchNotifier(this.key);

  final SearchKey key;

  @override
  Future<CursorPage<AttorneyRow>> fetch(String? cursor) => ref
      .read(searchRepositoryProvider)
      .attorneys(key.q, key.filters, cursor: cursor);

  @override
  Object idOf(AttorneyRow item) => item.id;
}

final attorneySearchProvider = AsyncNotifierProvider.autoDispose
    .family<AttorneySearchNotifier, PaginatedList<AttorneyRow>, SearchKey>(
  AttorneySearchNotifier.new,
  retry: _noRetry,
);

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
  PostSearchNotifier(this.q);

  final String q;

  @override
  Future<CursorPage<Post>> fetch(String? cursor) =>
      ref.read(searchRepositoryProvider).posts(q, cursor: cursor);

  @override
  Object idOf(Post item) => item.id;
}

final postSearchProvider = AsyncNotifierProvider.autoDispose
    .family<PostSearchNotifier, PaginatedList<Post>, String>(
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

/// §7.2 recent searches: local, per account, clearable.
class RecentSearches extends AsyncNotifier<List<String>> {
  @override
  Future<List<String>> build() async {
    final owner = ref.watch(currentUserIdProvider);
    if (owner == null) return const [];
    return ref.watch(socialLocalDatabaseProvider).recent(owner);
  }

  Future<void> remember(String query) async {
    final owner = ref.read(currentUserIdProvider);
    final q = normalizeSearch(query);
    if (owner == null || q.length < kSearchMinChars) return;
    await ref.read(socialLocalDatabaseProvider).remember(owner, q);
    ref.invalidateSelf();
  }

  Future<void> clear() async {
    final owner = ref.read(currentUserIdProvider);
    if (owner == null) return;
    await ref.read(socialLocalDatabaseProvider).clearRecent(owner);
    state = const AsyncData([]);
  }
}

final recentSearchesProvider =
    AsyncNotifierProvider<RecentSearches, List<String>>(RecentSearches.new);
