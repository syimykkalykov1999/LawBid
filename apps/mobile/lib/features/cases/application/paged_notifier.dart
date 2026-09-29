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

  @override
  Future<PaginatedList<T>> build() async =>
      PaginatedList.firstPage(await fetch(null));

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
