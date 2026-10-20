import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/shared/domain/cursor_page.dart';

/// Shared cursor-pagination behaviour of every docs/04 list (docs/01
/// §8.3): first page on build, [loadMore] / [retryLoadMore] at the list
/// end, pull-to-refresh that keeps loaded rows when it fails. Same rules
/// as ActiveDevicesController, factored for the many cases/bids lists.
abstract class PagedNotifier<T> extends AsyncNotifier<PaginatedList<T>> {
  /// Bumped by [refresh]; a next-page response from an older generation
  /// is dropped instead of being appended to the fresh first page.
  int _generation = 0;

  /// One page starting at [cursor] (null = first page).
  Future<CursorPage<T>> fetch(String? cursor);

  Object idOf(T item);

  /// Owner 2026-10-18 (speed): how long a list stays in memory after its
  /// last screen let go of it (Posts ↔ Reels, a topic switch, the chats
  /// closed and reopened). Coming back within that time shows the loaded
  /// rows at once instead of a fresh first-page load. Null (the default) =
  /// dropped right away as before. Pull-to-refresh and invalidation still
  /// re-read the list as before.
  Duration? get keepAliveFor => null;

  @override
  Future<PaginatedList<T>> build() async {
    _cacheFor();
    return PaginatedList.firstPage(await fetch(null));
  }

  /// The standard Riverpod "cache for" pattern: hold the provider, and let
  /// it go [keepAliveFor] after the last listener left (a listener coming
  /// back in time cancels the countdown).
  void _cacheFor() {
    final hold = keepAliveFor;
    if (hold == null) return;
    final link = ref.keepAlive();
    Timer? timer;
    ref
      ..onCancel(() {
        timer?.cancel();
        timer = Timer(hold, link.close);
      })
      ..onResume(() => timer?.cancel())
      ..onDispose(() => timer?.cancel());
  }

  Future<void> refresh() async {
    _generation++;
    final previous = state.value;
    if (previous == null) {
      state = const AsyncLoading();
      final next = await AsyncValue.guard(
        () async => PaginatedList.firstPage(await fetch(null)),
      );
      if (ref.mounted) state = next;
      return;
    }
    final page = await fetch(null);
    if (ref.mounted) state = AsyncData(PaginatedList.firstPage(page));
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.canLoadMore) return;
    state = AsyncData(current.loadingMore());
    final generation = _generation;
    try {
      final page = await fetch(current.nextCursor);
      if (!ref.mounted || generation != _generation) return;
      state = AsyncData((state.value ?? current).appended(page, idOf: idOf));
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

  /// Drops rows locally (no refetch that would lose loaded pages).
  void removeWhere(bool Function(T item) test) {
    final current = state.value;
    if (current != null) state = AsyncData(current.without(test));
  }
}
