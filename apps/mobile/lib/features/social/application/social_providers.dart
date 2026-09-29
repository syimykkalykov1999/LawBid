import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

// No silent automatic retries: a failed load shows its error/offline
// state with Retry at once (docs/01 §8.3).
Duration? _noRetry(int retryCount, Object error) => null;

// --- Infrastructure --------------------------------------------------------

final socialLocalDatabaseProvider = Provider<SocialLocalDatabase>((ref) {
  final db = SocialLocalDatabase();
  ref.onDispose(db.close);
  return db;
});

/// The signed-in user's id (JWT `sub`), or null signed out.
final currentUserIdProvider = Provider<String?>(
  (ref) => ref.watch(sessionControllerProvider.select((s) => s?.sub)),
);

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
  Map<String, Post> build() => const {};

  void put(Post post) => state = {...state, post.id: post};
}

final postOverridesProvider =
    NotifierProvider<PostOverrides, Map<String, Post>>(PostOverrides.new);

class DeletedPosts extends Notifier<Set<String>> {
  @override
  Set<String> build() => const {};

  void add(String id) => state = {...state, id};
}

final deletedPostsProvider =
    NotifierProvider<DeletedPosts, Set<String>>(DeletedPosts.new);

/// Follow state changed in this session, by attorney id.
class FollowOverrides extends Notifier<Map<String, bool>> {
  @override
  Map<String, bool> build() => const {};

  void put(String attorneyId, bool following) =>
      state = {...state, attorneyId: following};
}

final followOverridesProvider =
    NotifierProvider<FollowOverrides, Map<String, bool>>(FollowOverrides.new);

// --- Feed (docs/05 §2) -----------------------------------------------------

class FeedNotifier extends PagedNotifier<Post> {
  /// The page on screen came from the offline cache (§2.3 "Нет сети").
  bool fromCache = false;

  @override
  Future<CursorPage<Post>> fetch(String? cursor) async {
    final repo = ref.read(socialRepositoryProvider);
    try {
      final page = await repo.feed(cursor: cursor);
      if (cursor == null) fromCache = false;
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
    state = AsyncData(PaginatedList(
      items: [post, ...current.items.where((p) => p.id != post.id)],
      nextCursor: current.nextCursor,
    ),);
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

typedef TagPostsKey = ({String tag, TagSort sort});

class TagPostsNotifier extends PagedNotifier<Post> {
  TagPostsNotifier(this.key);

  final TagPostsKey key;

  @override
  Future<CursorPage<Post>> fetch(String? cursor) => ref
      .read(socialRepositoryProvider)
      .tagPosts(key.tag, key.sort, cursor: cursor);

  @override
  Object idOf(Post item) => item.id;
}

final tagPostsProvider = AsyncNotifierProvider.autoDispose
    .family<TagPostsNotifier, PaginatedList<Post>, TagPostsKey>(
  TagPostsNotifier.new,
  retry: _noRetry,
);

class SavedPostsNotifier extends PagedNotifier<SavedPost> {
  @override
  Future<CursorPage<SavedPost>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).savedPosts(cursor: cursor);

  @override
  Object idOf(SavedPost item) => item.postId;
}

final savedPostsProvider = AsyncNotifierProvider.autoDispose<
    SavedPostsNotifier, PaginatedList<SavedPost>>(
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
  Future<CursorPage<Comment>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).comments(postId, cursor: cursor);

  @override
  Object idOf(Comment item) => item.id;

  void add(Comment c) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(PaginatedList(
      items: [c, ...current.items],
      nextCursor: current.nextCursor,
    ),);
  }

  void replace(Comment c) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(PaginatedList(
      items: [for (final x in current.items) x.id == c.id ? c : x],
      nextCursor: current.nextCursor,
    ),);
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

  void add(Comment c) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(PaginatedList(
      items: [...current.items, c],
      nextCursor: current.nextCursor,
    ),);
  }

  void replace(Comment c) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(PaginatedList(
      items: [for (final x in current.items) x.id == c.id ? c : x],
      nextCursor: current.nextCursor,
    ),);
  }
}

final repliesProvider = AsyncNotifierProvider.autoDispose
    .family<RepliesNotifier, PaginatedList<Comment>, String>(
  RepliesNotifier.new,
  retry: _noRetry,
);

// --- Follows (docs/05 §6) --------------------------------------------------

enum FollowListKind { followers, following }

typedef FollowListKey = ({String attorneyId, FollowListKind kind});

class FollowListNotifier extends PagedNotifier<AttorneyRow> {
  FollowListNotifier(this.key);

  final FollowListKey key;

  @override
  Future<CursorPage<AttorneyRow>> fetch(String? cursor) {
    final repo = ref.read(socialRepositoryProvider);
    return key.kind == FollowListKind.followers
        ? repo.followers(key.attorneyId, cursor: cursor)
        : repo.following(key.attorneyId, cursor: cursor);
  }

  @override
  Object idOf(AttorneyRow item) => item.id;
}

final followListProvider = AsyncNotifierProvider.autoDispose
    .family<FollowListNotifier, PaginatedList<AttorneyRow>, FollowListKey>(
  FollowListNotifier.new,
  retry: _noRetry,
);

class MyFollowingNotifier extends PagedNotifier<AttorneyRow> {
  @override
  Future<CursorPage<AttorneyRow>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).myFollowing(cursor: cursor);

  @override
  Object idOf(AttorneyRow item) => item.id;
}

final myFollowingProvider = AsyncNotifierProvider.autoDispose<
    MyFollowingNotifier, PaginatedList<AttorneyRow>>(
  MyFollowingNotifier.new,
  retry: _noRetry,
);

class SuggestionsNotifier extends PagedNotifier<AttorneyRow> {
  @override
  Future<CursorPage<AttorneyRow>> fetch(String? cursor) =>
      ref.read(socialRepositoryProvider).suggestions(cursor: cursor);

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

  Future<Object?> toggleLike(Post post) => _guard('like:${post.id}', () async {
        final before = _latest(post);
        final liked = !before.likedByMe;
        _ref.read(postOverridesProvider.notifier).put(before.copyWith(
              likedByMe: liked,
              likeCount: (before.likeCount + (liked ? 1 : -1)).clamp(0, 1 << 31),
            ),);
        try {
          await _repo.setLiked(post.id, liked: liked);
        } on Object {
          _ref.read(postOverridesProvider.notifier).put(before);
          rethrow;
        }
      });

  /// Double tap on a photo only ever likes (§2.4).
  Future<Object?> like(Post post) async =>
      _latest(post).likedByMe ? null : toggleLike(post);

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
      });

  Future<Object?> editPost(Post post, String body) =>
      _guard('edit:${post.id}', () async {
        final updated = await _repo.updatePost(post.id, body);
        _ref.read(postOverridesProvider.notifier).put(updated.copyWith(
              likedByMe: _latest(post).likedByMe,
              savedByMe: _latest(post).savedByMe,
            ),);
      });

  Future<Object?> setFollowing(String attorneyId, bool following) =>
      _guard('follow:$attorneyId', () async {
        final overrides = _ref.read(followOverridesProvider.notifier);
        overrides.put(attorneyId, following);
        try {
          await _repo.setFollowing(attorneyId, following: following);
        } on Object {
          overrides.put(attorneyId, !following);
          rethrow;
        }
      });

  Future<Object?> report(
          ReportTarget target, String id, ReportReason reason,) =>
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

  Future<String> uploadPhoto(Uint8List bytes,
          {void Function(double)? onProgress,}) =>
      _repo.uploadPostPhoto(bytes, onProgress: onProgress);
}

final socialActionsProvider = Provider<SocialActions>(SocialActions.new);
