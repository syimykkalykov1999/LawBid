import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/channels/data/channels_repository.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

final channelsRepositoryProvider = Provider<ChannelsRepository>(
  (ref) => ChannelsRepository(
    apiDio: ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
  ),
);

/// Feature flag `channels`: off = no entry points, the routes show nothing.
final channelsEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled('channels'),
);

/// One list of the channels screen: my channels, the ones I follow, or the
/// discover / search result for the query.
typedef ChannelListKey = ({ChannelScope scope, String query});

final channelListProvider =
    FutureProvider.autoDispose.family<List<Channel>, ChannelListKey>(
  (ref, key) =>
      ref.watch(channelsRepositoryProvider).list(key.scope, q: key.query),
);

/// Owner 2026-10-21 (inbox 22c): the channels I moved to the channels' own
/// Archive.
final archivedChannelsProvider = FutureProvider.autoDispose<List<Channel>>(
  (ref) => ref
      .watch(channelsRepositoryProvider)
      .list(ChannelScope.subscribed, archived: true),
);

/// «Discover» with nothing typed: an endless list, ranked for me first.
class RecommendedChannelsNotifier extends PagedNotifier<Channel> {
  @override
  Future<CursorPage<Channel>> fetch(String? cursor) =>
      ref.read(channelsRepositoryProvider).recommended(cursor: cursor);

  @override
  Object idOf(Channel item) => item.id;
}

final recommendedChannelsProvider = AsyncNotifierProvider.autoDispose<
    RecommendedChannelsNotifier, PaginatedList<Channel>>(
  RecommendedChannelsNotifier.new,
);

/// One channel by id or @username. Subscribe / mute change it in place.
final channelProvider = AsyncNotifierProvider.autoDispose
    .family<ChannelController, Channel, String>(
  ChannelController.new,
);

class ChannelController extends AsyncNotifier<Channel> {
  ChannelController(this.channelRef);

  final String channelRef;

  @override
  Future<Channel> build() =>
      ref.watch(channelsRepositoryProvider).get(channelRef);

  ChannelsRepository get _repo => ref.read(channelsRepositoryProvider);

  /// Subscribe / unsubscribe. The button flips at once; on an error it goes
  /// back and the error is rethrown for the screen to show.
  Future<void> setSubscribed({required bool on}) async {
    final c = state.value;
    if (c == null || c.isSubscribed == on) return;
    state = AsyncData(
      c.copyWith(
        isSubscribed: on,
        isMuted: on && c.isMuted,
        subscriberCount: math.max(0, c.subscriberCount + (on ? 1 : -1)),
      ),
    );
    try {
      final next = on ? await _repo.subscribe(c) : await _repo.unsubscribe(c);
      if (ref.mounted) state = AsyncData(next);
      _refreshLists();
    } on Object {
      if (ref.mounted) state = AsyncData(c);
      rethrow;
    }
  }

  Future<void> setMuted({required bool muted}) async {
    final c = state.value;
    if (c == null || c.isMuted == muted) return;
    state = AsyncData(c.copyWith(isMuted: muted));
    try {
      final next = await _repo.mute(c, muted: muted);
      if (ref.mounted) state = AsyncData(next);
    } on Object {
      if (ref.mounted) state = AsyncData(c);
      rethrow;
    }
  }

  /// Puts a saved channel (edit form) in place of the shown one.
  // ignore: use_setters_to_change_properties
  void replace(Channel next) {
    state = AsyncData(next);
    _refreshLists();
  }

  void _refreshLists() => ref
    ..invalidate(channelListProvider)
    ..invalidate(archivedChannelsProvider);
}

/// The posts of a channel, newest first, loaded page by page.
final channelPostsProvider = AsyncNotifierProvider.autoDispose
    .family<ChannelPostsNotifier, PaginatedList<ChannelPost>, String>(
  ChannelPostsNotifier.new,
);

class ChannelPostsNotifier extends AsyncNotifier<PaginatedList<ChannelPost>> {
  ChannelPostsNotifier(this.channelId);

  final String channelId;

  int _generation = 0;
  final _seen = <String>{};
  final _pending = <String>{};
  Timer? _flush;
  ChannelsRepository? _repoCache;

  // Kept from build(): [ref] cannot be read once the provider is disposed.
  ChannelsRepository get _repo {
    final cached = _repoCache;
    if (cached != null) return cached;
    final repo = ref.read(channelsRepositoryProvider);
    _repoCache = repo;
    return repo;
  }

  @override
  Future<PaginatedList<ChannelPost>> build() async {
    _repo;
    ref.onDispose(() {
      _flush?.cancel();
      if (_pending.isNotEmpty) unawaited(_send());
    });
    final page = await _repo.posts(channelId);
    return PaginatedList.firstPage(
      CursorPage(items: page.items, nextCursor: page.nextCursor),
    );
  }

  Future<void> refresh() async {
    _generation++;
    final page = await _repo.posts(channelId);
    if (!ref.mounted) return;
    state = AsyncData(
      PaginatedList.firstPage(
        CursorPage(items: page.items, nextCursor: page.nextCursor),
      ),
    );
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.canLoadMore) return;
    state = AsyncData(current.loadingMore());
    final generation = _generation;
    try {
      final page = await _repo.posts(channelId, cursor: current.nextCursor);
      if (!ref.mounted || generation != _generation) return;
      state = AsyncData(
        (state.value ?? current).appended(
          CursorPage(items: page.items, nextCursor: page.nextCursor),
          idOf: (p) => p.id,
        ),
      );
    } on Object catch (error) {
      if (!ref.mounted || generation != _generation) return;
      state = AsyncData((state.value ?? current).failedMore(error));
    }
  }

  Future<void> retryLoadMore() async {
    final current = state.value;
    if (current == null || current.loadMoreError == null) return;
    state = AsyncData(
      PaginatedList(items: current.items, nextCursor: current.nextCursor),
    );
    await loadMore();
  }

  /// A shared link names one post: it is put first when the first page
  /// does not hold it.
  Future<void> focus(String postId) async {
    final current = await future;
    if (current.items.any((p) => p.id == postId)) return;
    try {
      final post = await _repo.post(channelId, postId);
      if (!ref.mounted) return;
      final now = state.value ?? current;
      state = AsyncData(
        PaginatedList(
          items: [post, ...now.items],
          nextCursor: now.nextCursor,
          isLoadingMore: now.isLoadingMore,
          loadMoreError: now.loadMoreError,
        ),
      );
    } on Object {
      // The post is gone: the channel opens on its feed as usual.
    }
  }

  void prepend(ChannelPost post) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      PaginatedList(
        items: [post, ...current.items.where((p) => p.id != post.id)],
        nextCursor: current.nextCursor,
        isLoadingMore: current.isLoadingMore,
        loadMoreError: current.loadMoreError,
      ),
    );
  }

  /// Rewrites one post in the list (a reaction, a comment count, an edit).
  void patch(String postId, ChannelPost Function(ChannelPost) change) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      PaginatedList(
        items: [
          for (final p in current.items)
            if (p.id == postId) change(p) else p,
        ],
        nextCursor: current.nextCursor,
        isLoadingMore: current.isLoadingMore,
        loadMoreError: current.loadMoreError,
      ),
    );
  }

  /// One reaction per reader: [emoji] sets it, the same emoji again removes
  /// it. The counts move at once; an error puts the post back and rethrows.
  Future<void> toggleReaction(ChannelPost post, String emoji) async {
    final remove = post.myReaction == emoji;
    patch(post.id, (p) => p.withMyReaction(remove ? null : emoji));
    try {
      final saved = remove
          ? await _repo.unreact(channelId, post.id)
          : await _repo.react(channelId, post.id, emoji);
      if (ref.mounted) patch(post.id, (_) => saved);
    } on Object {
      if (ref.mounted) patch(post.id, (_) => post);
      rethrow;
    }
  }

  Future<void> edit(ChannelPost post, String body) async {
    final saved = await _repo.editPost(channelId, post.id, body);
    if (ref.mounted) patch(post.id, (_) => saved);
  }

  Future<void> remove(ChannelPost post) async {
    await _repo.removePost(channelId, post.id);
    if (!ref.mounted) return;
    final current = state.value;
    if (current != null) {
      state = AsyncData(current.without((p) => p.id == post.id));
    }
    ref.invalidate(channelProvider);
  }

  /// A completed share: the counter moves after the server confirmed.
  Future<void> shared(String postId) async {
    try {
      await _repo.sharePost(channelId, postId);
    } on Object {
      return;
    }
    if (ref.mounted) {
      patch(postId, (p) => p.copyWith(shareCount: p.shareCount + 1));
    }
  }

  /// A post that stayed on screen counts as viewed; the ids are sent in
  /// one batch a moment later (the server counts one view per reader).
  void viewed(String postId) {
    if (!_seen.add(postId)) return;
    _pending.add(postId);
    _flush?.cancel();
    _flush = Timer(const Duration(seconds: 1), () => unawaited(_send()));
  }

  Future<void> _send() async {
    final ids = _pending.toList();
    _pending.clear();
    for (var i = 0; i < ids.length; i += 50) {
      final chunk = ids.sublist(i, math.min(i + 50, ids.length));
      try {
        await _repo.markViewed(channelId, chunk);
      } on Object {
        // Counting is best-effort: shown again, the post is sent again.
        _seen.removeAll(chunk);
      }
    }
  }
}

/// The comments of one post, oldest first.
typedef ChannelPostKey = ({String channelId, String postId});

final channelCommentsProvider = AsyncNotifierProvider.autoDispose.family<
    ChannelCommentsNotifier, PaginatedList<ChannelComment>, ChannelPostKey>(
  ChannelCommentsNotifier.new,
);

class ChannelCommentsNotifier
    extends AsyncNotifier<PaginatedList<ChannelComment>> {
  ChannelCommentsNotifier(this.key);

  final ChannelPostKey key;

  ChannelsRepository get _repo => ref.read(channelsRepositoryProvider);

  @override
  Future<PaginatedList<ChannelComment>> build() async {
    final page = await _repo.comments(key.channelId, key.postId);
    return PaginatedList.firstPage(
      CursorPage(items: page.items, nextCursor: page.nextCursor),
    );
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.canLoadMore) return;
    state = AsyncData(current.loadingMore());
    try {
      final page = await _repo.comments(
        key.channelId,
        key.postId,
        cursor: current.nextCursor,
      );
      if (!ref.mounted) return;
      state = AsyncData(
        (state.value ?? current).appended(
          CursorPage(items: page.items, nextCursor: page.nextCursor),
          idOf: (c) => c.id,
        ),
      );
    } on Object catch (error) {
      if (!ref.mounted) return;
      state = AsyncData((state.value ?? current).failedMore(error));
    }
  }

  Future<void> retryLoadMore() async {
    final current = state.value;
    if (current == null || current.loadMoreError == null) return;
    state = AsyncData(
      PaginatedList(items: current.items, nextCursor: current.nextCursor),
    );
    await loadMore();
  }

  Future<void> add(String body) async {
    final comment = await _repo.addComment(key.channelId, key.postId, body);
    if (!ref.mounted) return;
    final current = state.value;
    if (current != null) {
      state = AsyncData(
        PaginatedList(
          items: [...current.items, comment],
          nextCursor: current.nextCursor,
        ),
      );
    }
    _bump(1);
  }

  Future<void> remove(ChannelComment comment) async {
    await _repo.removeComment(key.channelId, key.postId, comment.id);
    if (!ref.mounted) return;
    final current = state.value;
    if (current != null) {
      state = AsyncData(current.without((c) => c.id == comment.id));
    }
    _bump(-1);
  }

  void _bump(int by) =>
      ref.read(channelPostsProvider(key.channelId).notifier).patch(
            key.postId,
            (p) => p.copyWith(commentCount: math.max(0, p.commentCount + by)),
          );
}

/// The admins of a channel (owner's screen).
final channelAdminsProvider = AsyncNotifierProvider.autoDispose
    .family<ChannelAdminsNotifier, List<ChannelAdmin>, String>(
  ChannelAdminsNotifier.new,
);

class ChannelAdminsNotifier extends AsyncNotifier<List<ChannelAdmin>> {
  ChannelAdminsNotifier(this.channelId);

  final String channelId;

  ChannelsRepository get _repo => ref.read(channelsRepositoryProvider);

  @override
  Future<List<ChannelAdmin>> build() => _repo.admins(channelId);

  Future<void> add(String username) async {
    final next = await _repo.addAdmin(channelId, username);
    if (ref.mounted) state = AsyncData(next);
  }

  Future<void> remove(ChannelAdmin admin) async {
    await _repo.removeAdmin(channelId, admin.user.id);
    if (!ref.mounted) return;
    final current = state.value;
    if (current != null) {
      state = AsyncData([
        for (final a in current)
          if (a.user.id != admin.user.id) a,
      ]);
    }
  }
}
