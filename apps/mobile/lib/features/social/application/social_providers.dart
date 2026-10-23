import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/file_types.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart'
    show topicTagFor;
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/social/application/post_insights_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

// No silent automatic retries: a failed load shows its error/offline
// state with Retry at once (docs/01 §8.3).
Duration? _noRetry(int retryCount, Object error) => null;

// --- Infrastructure --------------------------------------------------------

final socialLocalDatabaseProvider = Provider<SocialLocalDatabase>((ref) {
  final db = SocialLocalDatabase();
  ref.onDispose(db.close);
  return db;
});

/// Owner 2026-10-20 (speed): the saved last answers of this account's
/// screens (chat list, own profile) — see [SavedJson].
final savedJsonProvider = Provider<SavedJson>(
  (ref) => SavedJson(
    ref.watch(socialLocalDatabaseProvider),
    ref.watch(currentUserIdProvider),
  ),
);

/// The signed-in user's id (JWT `sub`), or null signed out.
/// The account the app acts as — for an assistant (OQ-048) the attorney
/// whose account they work in, so the attorney's messages/posts are "mine".
final currentUserIdProvider = Provider<String?>((ref) {
  final acting = ref.watch(activeAssistantProvider)?.attorneyId;
  return acting ?? ref.watch(sessionControllerProvider.select((s) => s?.sub));
});

/// Owner 2026-10-13: may the viewer add attachments to a post / reel? The
/// composer hides the clip and the extra photos without it; the server
/// checks again (403).
final postAttachmentsAllowedProvider = FutureProvider.autoDispose<bool>(
  (ref) async {
    try {
      return await ref.watch(socialRepositoryProvider).attachmentsAllowed();
    } on Object {
      return false;
    }
  },
);

/// Owner 2026-10-13: inner cards (the page behind a post / reel with
/// attachments, the «Watch» strip). Viewing never depends on the viewer's
/// own right to add files: a post that has files or extra photos always
/// opens, for everyone.
final innerCardsEnabledProvider = Provider<bool>((ref) => true);

final socialRepositoryProvider = Provider<SocialRepository>(
  (ref) => ApiSocialRepository(
    apiDio: ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
    local: ref.watch(socialLocalDatabaseProvider),
    ownerId: ref.watch(currentUserIdProvider),
  ),
);

// --- One source of truth for posts shown in many lists ---------------------

/// Latest local version of posts changed by the user (like, save, edit),
/// so the feed, tag pages, profile grids and search stay in sync without
/// refetching (docs/05 §4 optimistic UI).
class PostOverrides extends Notifier<Map<String, Post>> {
  @override
  Map<String, Post> build() {
    // Audit 2026-10-02: another account never inherits these.
    ref.watch(currentUserIdProvider);
    return const {};
  }

  void put(Post post) => state = {...state, post.id: post};

  /// A fresh first page from the server is the truth again — for the posts
  /// on that page only (other screens keep their optimistic state).
  void clearFor(Iterable<String> ids) {
    final drop = ids.toSet();
    if (drop.isEmpty || !state.keys.any(drop.contains)) return;
    state = {
      for (final e in state.entries)
        if (!drop.contains(e.key)) e.key: e.value,
    };
  }

  void clear() => state = const {};
}

final postOverridesProvider =
    NotifierProvider<PostOverrides, Map<String, Post>>(PostOverrides.new);

/// Posts gone from every public list in this session: deleted, or (owner
/// 2026-10-18) archived — an archived one comes back with [remove] when the
/// author shows it in the profile again.
class DeletedPosts extends Notifier<Set<String>> {
  @override
  Set<String> build() {
    ref.watch(currentUserIdProvider);
    return const {};
  }

  void add(String id) => state = {...state, id};

  void remove(String id) => state = {...state}..remove(id);
}

final deletedPostsProvider =
    NotifierProvider<DeletedPosts, Set<String>>(DeletedPosts.new);

/// Follow state changed in this session, by attorney id.
class FollowOverrides extends Notifier<Map<String, bool>> {
  @override
  Map<String, bool> build() {
    ref.watch(currentUserIdProvider);
    return const {};
  }

  // ignore: avoid_positional_boolean_parameters
  void put(String attorneyId, bool following) =>
      state = {...state, attorneyId: following};
}

final followOverridesProvider =
    NotifierProvider<FollowOverrides, Map<String, bool>>(FollowOverrides.new);

/// Owner 2026-10-22 (package D): follower counts the server answered to a
/// follow / unfollow in this session, by attorney id — the profile shows
/// them without being re-read.
class FollowerCounts extends Notifier<Map<String, int>> {
  @override
  Map<String, int> build() {
    ref.watch(currentUserIdProvider);
    return const {};
  }

  void put(String attorneyId, int count) =>
      state = {...state, attorneyId: count};
}

final followerCountsProvider =
    NotifierProvider<FollowerCounts, Map<String, int>>(FollowerCounts.new);

// --- Feed (docs/05 §2) -----------------------------------------------------

class FeedNotifier extends PagedNotifier<Post> {
  /// The page on screen came from the offline cache (§2.3 "Нет сети").
  bool fromCache = false;

  // Owner 2026-10-18 (speed): kept for 5 minutes after the screen leaves
  // (see PagedNotifier.keepAliveFor).
  @override
  Duration? get keepAliveFor => const Duration(minutes: 5);

  // Owner 2026-10-20 (speed): the feed opens on the page saved by the last
  // visit and refreshes in the background (see PagedNotifier).
  @override
  Future<CursorPage<Post>?> cachedFirstPage() async {
    final saved = await ref.read(socialRepositoryProvider).cachedFeed();
    // The page on screen is the copy until the live first page arrives.
    if (saved != null) fromCache = true;
    return saved;
  }

  @override
  Future<CursorPage<Post>> fetch(String? cursor) async {
    final repo = ref.read(socialRepositoryProvider);
    try {
      final page = await repo.feed(cursor: cursor);
      if (cursor == null) {
        fromCache = false;
        ref
            .read(postOverridesProvider.notifier)
            .clearFor(page.items.map((p) => p.id));
      }
      return page;
    } on ApiException catch (e) {
      if (cursor != null || !e.isNetworkError) rethrow;
      final cached = await repo.cachedFeed();
      if (cached == null) rethrow;
      fromCache = true;
      return cached;
    }
  }

  @override
  Object idOf(Post item) => item.id;

  void prepend(Post post) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      PaginatedList(
        items: [post, ...current.items.where((p) => p.id != post.id)],
        nextCursor: current.nextCursor,
      ),
    );
  }
}

final feedProvider =
    AsyncNotifierProvider.autoDispose<FeedNotifier, PaginatedList<Post>>(
  FeedNotifier.new,
  retry: _noRetry,
);

// --- Posts of an attorney, a tag, saved --------------------------------------

class AttorneyPostsNotifier extends PagedNotifier<Post> {
  AttorneyPostsNotifier(this.attorneyId);

  final String attorneyId;

  @override
  Future<CursorPage<Post>> fetch(String? cursor) => ref
      .read(socialRepositoryProvider)
      .attorneyPosts(attorneyId, cursor: cursor);

  @override
  Object idOf(Post item) => item.id;
}

final attorneyPostsProvider = AsyncNotifierProvider.autoDispose
    .family<AttorneyPostsNotifier, PaginatedList<Post>, String>(
  AttorneyPostsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-18: Settings → «Архив» — the viewer's own archived posts,
/// newest archived first.
class ArchivedPostsNotifier extends PagedNotifier<Post> {
  @override
  Future<CursorPage<Post>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).archivedPosts(cursor: cursor);

  @override
  Object idOf(Post item) => item.id;
}

final archivedPostsProvider = AsyncNotifierProvider.autoDispose<
    ArchivedPostsNotifier, PaginatedList<Post>>(
  ArchivedPostsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-09-30: the profile's News tab.
class AttorneyNewsNotifier extends AttorneyPostsNotifier {
  AttorneyNewsNotifier(super.attorneyId);

  @override
  Future<CursorPage<Post>> fetch(String? cursor) => ref
      .read(socialRepositoryProvider)
      .attorneyPosts(attorneyId, cursor: cursor, newsOnly: true);
}

final attorneyNewsProvider = AsyncNotifierProvider.autoDispose
    .family<AttorneyPostsNotifier, PaginatedList<Post>, String>(
  AttorneyNewsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-18: the profile's «Посты» grid — photo / file posts only
/// (reels have their own tab, briefs theirs).
class AttorneyPhotoPostsNotifier extends AttorneyPostsNotifier {
  AttorneyPhotoPostsNotifier(super.attorneyId);

  @override
  Future<CursorPage<Post>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).attorneyPosts(
            attorneyId,
            cursor: cursor,
            media: ProfileMedia.visual,
          );
}

final attorneyPhotoPostsProvider = AsyncNotifierProvider.autoDispose
    .family<AttorneyPostsNotifier, PaginatedList<Post>, String>(
  AttorneyPhotoPostsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-18: the profile's «Рилсы» tab — video posts / reels,
/// newest first.
class AttorneyReelsNotifier extends AttorneyPostsNotifier {
  AttorneyReelsNotifier(super.attorneyId);

  @override
  Future<CursorPage<Post>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).attorneyPosts(
            attorneyId,
            cursor: cursor,
            media: ProfileMedia.video,
          );
}

final attorneyReelsProvider = AsyncNotifierProvider.autoDispose
    .family<AttorneyPostsNotifier, PaginatedList<Post>, String>(
  AttorneyReelsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-18: the profile's "Reposts" tab (any role).
class UserRepostsNotifier extends PagedNotifier<Post> {
  UserRepostsNotifier(this.userId);

  final String userId;

  @override
  Future<CursorPage<Post>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).userReposts(userId, cursor: cursor);

  @override
  Object idOf(Post item) => item.id;
}

final userRepostsProvider = AsyncNotifierProvider.autoDispose
    .family<UserRepostsNotifier, PaginatedList<Post>, String>(
  UserRepostsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-20: people who liked a post.
class PostLikersNotifier extends PagedNotifier<PersonRow> {
  PostLikersNotifier(this.postId);

  final String postId;

  @override
  Future<CursorPage<PersonRow>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).postLikers(postId, cursor: cursor);

  @override
  Object idOf(PersonRow item) => item.id;
}

final postLikersProvider = AsyncNotifierProvider.autoDispose
    .family<PostLikersNotifier, PaginatedList<PersonRow>, String>(
  PostLikersNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-18: people who reposted a post.
class PostRepostersNotifier extends PagedNotifier<PersonRow> {
  PostRepostersNotifier(this.postId);

  final String postId;

  @override
  Future<CursorPage<PersonRow>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).postReposters(postId, cursor: cursor);

  @override
  Object idOf(PersonRow item) => item.id;
}

final postRepostersProvider = AsyncNotifierProvider.autoDispose
    .family<PostRepostersNotifier, PaginatedList<PersonRow>, String>(
  PostRepostersNotifier.new,
  retry: _noRetry,
);

/// `state` (OQ-034): only posts of attorneys licensed there.
typedef TagPostsKey = ({String tag, TagSort sort, String? state});

class TagPostsNotifier extends PagedNotifier<Post> {
  TagPostsNotifier(this.key);

  final TagPostsKey key;

  @override
  Future<CursorPage<Post>> fetch(String? cursor) => ref
      .read(socialRepositoryProvider)
      .tagPosts(key.tag, key.sort, cursor: cursor, state: key.state);

  @override
  Object idOf(Post item) => item.id;
}

final tagPostsProvider = AsyncNotifierProvider.autoDispose
    .family<TagPostsNotifier, PaginatedList<Post>, TagPostsKey>(
  TagPostsNotifier.new,
  retry: _noRetry,
);

/// OQ-034: the feed's "All" topic with a state chosen; '' = every state
/// (the Search tab's posts grid).
class LatestPostsNotifier extends PagedNotifier<Post> {
  LatestPostsNotifier(this.stateCode);

  final String stateCode;

  /// Owner 2026-10-06: one state or several, comma-separated ("IL,NY").
  @override
  Future<CursorPage<Post>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).latestPosts(
            null,
            cursor: cursor,
            states: splitCodes(stateCode),
          );

  @override
  Object idOf(Post item) => item.id;
}

final latestPostsProvider = AsyncNotifierProvider.autoDispose
    .family<LatestPostsNotifier, PaginatedList<Post>, String>(
  LatestPostsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-09-30: the feed of one qualification (a category with its
/// subcategories, or a subcategory) and/or only News, optionally of
/// attorneys licensed in a state.
typedef FilteredPostsKey = ({
  // Owner 2026-10-06: one state or several, comma-separated ("IL,NY").
  String? state,
  String? practice,
  bool news,
  // Owner 2026-10-05: the "Posts" topic — general (personal) posts.
  bool general,
  // Owner 2026-10-06: «Юр. посты» → «Только мои темы», comma-separated
  // qualification codes (a String so the key compares by value).
  String? practices,
});

/// "IL,NY" → ['IL', 'NY']; null or empty → [].
List<String> splitCodes(String? joined) => [
      for (final c in (joined ?? '').split(','))
        if (c.isNotEmpty) c,
    ];

class FilteredPostsNotifier extends PagedNotifier<Post> {
  FilteredPostsNotifier(this.key);

  final FilteredPostsKey key;

  // Owner 2026-10-18 (speed): kept for 5 minutes after the screen leaves
  // (see PagedNotifier.keepAliveFor).
  @override
  Duration? get keepAliveFor => const Duration(minutes: 5);

  @override
  Future<CursorPage<Post>> fetch(String? cursor) {
    final practice = key.practice;
    return ref.read(socialRepositoryProvider).latestPosts(
          null,
          cursor: cursor,
          states: splitCodes(key.state),
          practice: practice,
          practices: splitCodes(key.practices),
          // Older posts without a qualification: the category's hashtag.
          tag: practice != null && !practice.contains('.')
              ? topicTagFor(practice)
              : null,
          newsOnly: key.news,
          generalOnly: key.general,
        );
  }

  @override
  Object idOf(Post item) => item.id;
}

/// Audit 2026-10-01: the Search tab's Posts explore grid — practice,
/// state, period, photos only and "popular" all applied on the server.
typedef ExplorePostsKey = ({
  String? state,
  String? practice,
  String? period,
  bool withPhotos,
  bool briefsOnly,
  bool popular,
  // Owner 2026-10-13: ranked for me (default sort of the grid).
  bool forYou,
});

class ExplorePostsNotifier extends PagedNotifier<Post> {
  ExplorePostsNotifier(this.key);

  final ExplorePostsKey key;

  @override
  Future<CursorPage<Post>> fetch(String? cursor) {
    final practice = key.practice;
    return ref.read(socialRepositoryProvider).latestPosts(
          key.state,
          cursor: cursor,
          practice: practice,
          tag: practice == null ? null : topicTagFor(practice.split('.').first),
          period: key.period,
          withPhotos: key.withPhotos,
          briefsOnly: key.briefsOnly,
          popular: key.popular,
          forYou: key.forYou,
        );
  }

  @override
  Object idOf(Post item) => item.id;
}

final explorePostsProvider = AsyncNotifierProvider.autoDispose
    .family<ExplorePostsNotifier, PaginatedList<Post>, ExplorePostsKey>(
  ExplorePostsNotifier.new,
  retry: _noRetry,
);

final filteredPostsProvider = AsyncNotifierProvider.autoDispose
    .family<FilteredPostsNotifier, PaginatedList<Post>, FilteredPostsKey>(
  FilteredPostsNotifier.new,
  retry: _noRetry,
);

class SavedPostsNotifier extends PagedNotifier<SavedPost> {
  @override
  Future<CursorPage<SavedPost>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).savedPosts(cursor: cursor);

  @override
  Object idOf(SavedPost item) => item.postId;
}

final savedPostsProvider = AsyncNotifierProvider.autoDispose<SavedPostsNotifier,
    PaginatedList<SavedPost>>(
  SavedPostsNotifier.new,
  retry: _noRetry,
);

final postProvider = FutureProvider.autoDispose.family<Post, String>(
  (ref, id) => ref.watch(socialRepositoryProvider).post(id),
  retry: _noRetry,
);

// --- Comments (docs/05 §5) -------------------------------------------------

class CommentsNotifier extends PagedNotifier<Comment> {
  CommentsNotifier(this.postId);

  final String postId;

  @override
  Future<PaginatedList<Comment>> build() {
    // Owner 2026-10-22 (client economy plan, package F): while the
    // comments are open the post's room sends new ones (`comment:new`);
    // a reply lands under its parent (RepliesNotifier).
    final realtime = ref.watch(realtimeClientProvider);
    realtime?.watchPost(postId);
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name != 'comment:new') return;
      final data = e.data;
      if (data is! Map || data['postId'] != postId) return;
      if (data['parentCommentId'] != null) return;
      final raw = data['comment'];
      if (raw is! Map) return;
      try {
        add(
          SocialMappers.comment(
            api.CommentDto.fromJson(Map<String, dynamic>.from(raw)),
          ),
        );
      } on Object {
        // An unknown shape: the next open shows it.
      }
    });
    ref.onDispose(() {
      sub.cancel();
      realtime?.unwatchPost(postId);
    });
    return super.build();
  }

  @override
  Future<CursorPage<Comment>> fetch(String? cursor) {
    // Owner 2026-10-22 (guest browsing): the comments are read with an
    // account (the API does not open them to a guest) — a «sign in».
    if (ref.read(isGuestProvider)) return Future.error(guestSignInRequired());
    return ref.read(socialRepositoryProvider).comments(postId, cursor: cursor);
  }

  @override
  Object idOf(Comment item) => item.id;

  /// A new comment (mine from the answer, or someone's from the room);
  /// the same one twice changes nothing.
  void add(Comment c) {
    final current = state.value;
    if (current == null) return;
    if (current.items.any((x) => x.id == c.id)) return;
    state = AsyncData(
      PaginatedList(
        items: [c, ...current.items],
        nextCursor: current.nextCursor,
      ),
    );
  }

  void replace(Comment c) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      PaginatedList(
        // ignore: prefer_if_elements_to_conditional_expressions
        items: [for (final x in current.items) x.id == c.id ? c : x],
        nextCursor: current.nextCursor,
      ),
    );
  }
}

final commentsProvider = AsyncNotifierProvider.autoDispose
    .family<CommentsNotifier, PaginatedList<Comment>, String>(
  CommentsNotifier.new,
  retry: _noRetry,
);

class RepliesNotifier extends PagedNotifier<Comment> {
  RepliesNotifier(this.commentId);

  final String commentId;

  @override
  Future<CursorPage<Comment>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).replies(commentId, cursor: cursor);

  @override
  Object idOf(Comment item) => item.id;

  /// My reply from the answer (package F: no reload of the thread); the
  /// same one twice changes nothing.
  void add(Comment c) {
    final current = state.value;
    if (current == null || current.items.any((x) => x.id == c.id)) return;
    state = AsyncData(
      PaginatedList(
        items: [...current.items, c],
        nextCursor: current.nextCursor,
      ),
    );
  }

  void replace(Comment c) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      PaginatedList(
        // ignore: prefer_if_elements_to_conditional_expressions
        items: [for (final x in current.items) x.id == c.id ? c : x],
        nextCursor: current.nextCursor,
      ),
    );
  }
}

final repliesProvider = AsyncNotifierProvider.autoDispose
    .family<RepliesNotifier, PaginatedList<Comment>, String>(
  RepliesNotifier.new,
  retry: _noRetry,
);

// --- Follows (docs/05 §6) --------------------------------------------------

enum FollowListKind { followers, following }

/// [q]: Owner 2026-10-18 — the search box above the list ('' = everyone).
typedef FollowListKey = ({String attorneyId, FollowListKind kind, String q});

class FollowListNotifier extends PagedNotifier<PersonRow> {
  FollowListNotifier(this.key);

  final FollowListKey key;

  @override
  Future<CursorPage<PersonRow>> fetch(String? cursor) async {
    final repo = ref.read(socialRepositoryProvider);
    if (key.kind == FollowListKind.followers) {
      return repo.followers(key.attorneyId, cursor: cursor, q: key.q);
    }
    return repo.following(key.attorneyId, cursor: cursor, q: key.q);
  }

  @override
  Object idOf(PersonRow item) => item.id;
}

final followListProvider = AsyncNotifierProvider.autoDispose
    .family<FollowListNotifier, PaginatedList<PersonRow>, FollowListKey>(
  FollowListNotifier.new,
  retry: _noRetry,
);

class SuggestionsNotifier extends PagedNotifier<AttorneyRow> {
  @override
  Future<CursorPage<AttorneyRow>> fetch(String? cursor) async {
    // Owner 2026-10-22 (guest browsing): «who to follow» is personal — a
    // guest has none, and asks nothing.
    if (ref.read(isGuestProvider)) {
      return const CursorPage<AttorneyRow>(items: []);
    }
    return ref.read(socialRepositoryProvider).suggestions(cursor: cursor);
  }

  @override
  Object idOf(AttorneyRow item) => item.id;
}

final suggestionsProvider = AsyncNotifierProvider.autoDispose<
    SuggestionsNotifier, PaginatedList<AttorneyRow>>(
  SuggestionsNotifier.new,
  retry: _noRetry,
);

// --- Actions ---------------------------------------------------------------

/// User actions on posts, comments and follows with optimistic UI and
/// rollback (docs/05 §4). Each returns the error for the caller's
/// snackbar, or null. Repeated taps while a request is in flight are
/// ignored, so the API is never called twice for one intent.
class SocialActions {
  SocialActions(this._ref);

  final Ref _ref;
  final Set<String> _busy = {};

  SocialRepository get _repo => _ref.read(socialRepositoryProvider);

  Post _latest(Post p) => _ref.read(postOverridesProvider)[p.id] ?? p;

  /// How long a like waits before it is sent — a «like → unlike» inside
  /// this window is no request at all (client economy plan, package K).
  static const likeSettle = Duration(milliseconds: 700);

  final _likeTimers = <String, Timer>{};

  /// Taps waiting for the one request of their window.
  final _likeWaiters = <String, List<Completer<Object?>>>{};

  /// What the server knows per post (the state the last request sent, or
  /// the state the post came with).
  final _likeKnown = <String, bool>{};

  /// Flips at once; the request goes after [likeSettle] and only when the
  /// final state differs from what the server knows.
  Future<Object?> toggleLike(Post post) async {
    final before = _latest(post);
    final liked = !before.likedByMe;
    _likeKnown.putIfAbsent(post.id, () => before.likedByMe);
    _ref.read(postOverridesProvider.notifier).put(
          before.copyWith(
            likedByMe: liked,
            likeCount: (before.likeCount + (liked ? 1 : -1)).clamp(0, 1 << 31),
          ),
        );
    _likeTimers[post.id]?.cancel();
    final done = Completer<Object?>();
    (_likeWaiters[post.id] ??= []).add(done);
    _likeTimers[post.id] = Timer(likeSettle, () async {
      _likeTimers.remove(post.id);
      final waiters = _likeWaiters.remove(post.id) ?? const [];
      final result = await _flushLike(post);
      for (final w in waiters) {
        w.complete(result);
      }
    });
    return done.future;
  }

  Future<Object?> _flushLike(Post post) => _guard('like:${post.id}', () async {
        final now = _latest(post);
        final liked = now.likedByMe;
        if (_likeKnown[post.id] == liked) return; // back where it was
        try {
          await _repo.setLiked(post.id, liked: liked);
          _likeKnown[post.id] = liked;
        } on Object {
          _ref.read(postOverridesProvider.notifier).put(
                now.copyWith(
                  likedByMe: !liked,
                  likeCount:
                      (now.likeCount + (liked ? -1 : 1)).clamp(0, 1 << 31),
                ),
              );
          rethrow;
        }
      });

  /// Owner 2026-10-07: Threads-style repost — optimistic like a like.
  /// One's own post can't be reposted (the server answers 409 too).
  Future<Object?> toggleRepost(Post post) async {
    if (post.isMine) {
      return const ApiException(
        code: ApiErrorCodes.repostOwnPost,
        message: 'You cannot repost your own post.',
      );
    }
    return _guard('repost:${post.id}', () async {
      final before = _latest(post);
      final reposted = !before.repostedByMe;
      _ref.read(postOverridesProvider.notifier).put(
            before.copyWith(
              repostedByMe: reposted,
              repostCount:
                  (before.repostCount + (reposted ? 1 : -1)).clamp(0, 1 << 31),
            ),
          );
      try {
        await _repo.setReposted(post.id, reposted: reposted);
        // The "Reposts" tab and the reposters list follow at once.
        final me = _ref.read(currentUserIdProvider);
        if (me != null) _ref.invalidate(userRepostsProvider(me));
        _ref.invalidate(postRepostersProvider(post.id));
      } on Object {
        _ref.read(postOverridesProvider.notifier).put(before);
        rethrow;
      }
    });
  }

  /// Double tap on a photo only ever likes (§2.4).
  Future<Object?> like(Post post) async =>
      _latest(post).likedByMe ? null : toggleLike(post);

  /// OQ-037: a completed share. Owner 2026-10-20: the counter moves after
  /// the server confirmed; the server counts one share per user per 24 h.
  Future<void> recordShare(Post post) async {
    try {
      await _repo.recordPostShare(post.id);
      final now = _latest(post);
      _ref
          .read(postOverridesProvider.notifier)
          .put(now.copyWith(shareCount: now.shareCount + 1));
    } on Object {
      // not counted
    }
  }

  /// Owner 2026-10-20: a reel / video was watched (3 s of real playback).
  /// Owner 2026-10-22 (client economy plan, package A): the view rides in
  /// the `POST /posts/events` batch (flush in 4 s, at most once per post
  /// per 30 min from this device); the counter moves at once (the server
  /// counts one view per viewer per 24 h, the true number returns on
  /// refresh).
  void recordView(Post post) {
    _ref.read(postEventsQueueProvider).view(post.id);
    if (!_viewed.add(post.id)) return;
    final now = _latest(post);
    _ref
        .read(postOverridesProvider.notifier)
        .put(now.copyWith(viewCount: now.viewCount + 1));
  }

  /// Posts already counted in this session (one «+1» per post).
  static final _viewed = <String>{};

  Future<Object?> toggleSave(Post post) => _guard('save:${post.id}', () async {
        final before = _latest(post);
        final saved = !before.savedByMe;
        _ref
            .read(postOverridesProvider.notifier)
            .put(before.copyWith(savedByMe: saved));
        try {
          await _repo.setSaved(post.id, saved: saved);
        } on Object {
          _ref.read(postOverridesProvider.notifier).put(before);
          rethrow;
        }
      });

  Future<Object?> deletePost(Post post) => _guard('del:${post.id}', () async {
        await _repo.deletePost(post.id);
        _ref.read(deletedPostsProvider.notifier).add(post.id);
        // The author's profile grids and post counters follow at once.
        _ref
          ..invalidate(archivedPostsProvider)
          ..invalidate(attorneyPostsProvider(post.author.id))
          ..invalidate(attorneyNewsProvider(post.author.id))
          ..invalidate(attorneyPhotoPostsProvider(post.author.id))
          ..invalidate(attorneyReelsProvider(post.author.id))
          ..invalidate(publicAttorneyProfileProvider)
          ..invalidate(publicClientProfileProvider);
      });

  /// Owner 2026-10-12: pin to slot 1..3 / unpin; the profile lists reload
  /// (pinned posts lead them).
  /// Owner 2026-10-15 (Instagram): the author hides / shows the like and
  /// view counters of an own post.
  Future<Object?> setCounters(
    Post post, {
    bool? hideLikes,
    bool? hideViews,
  }) =>
      _guard('counters:${post.id}', () async {
        final updated = await _repo.setPostCounters(
          post.id,
          hideLikes: hideLikes,
          hideViews: hideViews,
        );
        _ref.read(postOverridesProvider.notifier).put(updated);
      });

  Future<Object?> pinPost(Post post, int slot) =>
      _guard('pin:${post.id}', () async {
        final updated = await _repo.pinPost(post.id, slot);
        _ref.read(postOverridesProvider.notifier).put(updated);
        _refreshProfileLists(post);
      });

  Future<Object?> unpinPost(Post post) => _guard('pin:${post.id}', () async {
        final updated = await _repo.unpinPost(post.id);
        _ref.read(postOverridesProvider.notifier).put(updated);
        _refreshProfileLists(post);
      });

  /// Owner 2026-10-18 (Instagram): the author turns comments on / off; the
  /// open comments reload (hidden while off, back when on).
  Future<Object?> setCommentsEnabled(Post post, {required bool enabled}) =>
      _guard('comments-setting:${post.id}', () async {
        final updated =
            await _repo.setPostCommentsEnabled(post.id, enabled: enabled);
        _ref
          ..read(postOverridesProvider.notifier).put(updated)
          ..invalidate(commentsProvider(post.id));
      });

  /// Owner 2026-10-18: «Архивировать» — the post leaves every list at once
  /// (the server hides it from everyone but the author); «Показать в
  /// профиле» brings it back to its place by publish date.
  Future<Object?> setArchived(Post post, {required bool archived}) =>
      _guard('archive:${post.id}', () async {
        final updated =
            await _repo.setPostArchived(post.id, archived: archived);
        final hidden = _ref.read(deletedPostsProvider.notifier);
        if (archived) {
          hidden.add(post.id);
        } else {
          hidden.remove(post.id);
        }
        _ref
          ..read(postOverridesProvider.notifier).put(updated)
          ..invalidate(archivedPostsProvider)
          ..invalidate(publicAttorneyProfileProvider)
          ..invalidate(publicClientProfileProvider);
        _refreshProfileLists(post);
      });

  void _refreshProfileLists(Post post) {
    _ref
      ..invalidate(attorneyPostsProvider(post.author.id))
      ..invalidate(attorneyNewsProvider(post.author.id))
      ..invalidate(attorneyPhotoPostsProvider(post.author.id))
      ..invalidate(attorneyReelsProvider(post.author.id));
  }

  /// Owner 2026-09-30: title, text and qualification.
  Future<Object?> editPost(
    Post post, {
    required String body,
    String? title,
    String? practiceCode,
    bool? markedLegal,
  }) =>
      _guard('edit:${post.id}', () async {
        final updated = await _repo.updatePost(
          post.id,
          body: body,
          title: title,
          practiceCode: practiceCode,
          markedLegal: markedLegal,
        );
        _ref.read(postOverridesProvider.notifier).put(
              updated.copyWith(
                likedByMe: _latest(post).likedByMe,
                savedByMe: _latest(post).savedByMe,
              ),
            );
      });

  // ignore: avoid_positional_boolean_parameters
  Future<Object?> setFollowing(String attorneyId, bool following) =>
      _guard('follow:$attorneyId', () async {
        final overrides = _ref.read(followOverridesProvider.notifier);
        // ignore: cascade_invocations
        overrides.put(attorneyId, following);
        final FollowState result;
        try {
          result = await _repo.setFollowing(attorneyId, following: following);
        } on Object {
          overrides.put(attorneyId, !following);
          rethrow;
        }
        // Owner 2026-10-22 (package D): the answer carries the new state
        // and follower count — applied here, nothing is re-read.
        overrides.put(attorneyId, result.following);
        _ref
            .read(followerCountsProvider.notifier)
            .put(attorneyId, result.followersCount);
      });

  Future<Object?> report(
    ReportTarget target,
    String id,
    ReportReason reason,
  ) =>
      _guard('report:$id', () => _repo.report(target, id, reason));

  Future<Object?> _guard(String key, Future<void> Function() run) async {
    if (!_busy.add(key)) return null;
    try {
      await run();
      return null;
    } on Object catch (e) {
      return e;
    } finally {
      _busy.remove(key);
    }
  }

  Future<String> uploadPhoto(
    Uint8List bytes, {
    void Function(double)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
    // Owner 2026-10-19: the photo types the place allows (admin «Загрузки и
    // файлы»); another type is refused at once, before any upload.
    Set<String>? allowedMimes,
  }) async {
    final image = sniffImageMime(bytes);
    if (allowedMimes != null &&
        image != null &&
        !allowedMimes.contains(image)) {
      throw const ApiException(
        code: ApiErrorCodes.fileTypeNotAllowed,
        message: 'type',
      );
    }
    return _repo.uploadPostPhoto(
      bytes,
      onProgress: onProgress,
      casePhoto: casePhoto,
      reviewPhoto: reviewPhoto,
      fileName: fileName,
      maxBytes: maxBytes,
    );
  }

  /// Owner 2026-10-05: a post / reel document.
  Future<String> uploadDocument(
    Uint8List bytes,
    String mime, {
    required int maxBytes,
    void Function(double)? onProgress,
  }) =>
      _repo.uploadPostDocument(
        bytes,
        mime,
        maxBytes: maxBytes,
        onProgress: onProgress,
      );
}

final socialActionsProvider = Provider<SocialActions>(SocialActions.new);

/// Whether to draw [post]'s like counter for this viewer: the author always
/// sees it; others unless the author hid it or the viewer hides them all
/// (while the `hide_counts` flag is on).
bool showLikeCount(WidgetRef ref, Post post) {
  if (post.isMine) return true;
  if (!ref.watch(featureFlagsControllerProvider).isEnabled('hide_counts')) {
    return true;
  }
  // Owner 2026-10-15: no global «hide the like counts» setting any more —
  // only the author's choice for their own post.
  return !post.likesHidden;
}
