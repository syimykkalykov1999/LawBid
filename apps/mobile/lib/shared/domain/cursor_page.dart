import 'package:flutter/foundation.dart';

/// One page of a cursor-paginated list (docs/01 §7: success envelope
/// `{ "data": [...], "meta": { "nextCursor": "..." } }`; `.cursorrules`:
/// cursor pagination only, never offset). [nextCursor] is null on the last
/// page — including for endpoints that return the whole list at once.
@immutable
class CursorPage<T> {
  const CursorPage({required this.items, this.nextCursor});

  final List<T> items;
  final String? nextCursor;

  bool get hasMore => nextCursor != null && nextCursor!.isNotEmpty;
}

/// Accumulated state of a paginated list on screen: every item loaded so
/// far, the cursor for the next page, and the status of that next page.
/// Immutable; controllers produce new instances via the transitions below
/// so the rules live in one tested place.
@immutable
class PaginatedList<T> {
  const PaginatedList({
    required this.items,
    this.nextCursor,
    this.isLoadingMore = false,
    this.loadMoreError,
  });

  factory PaginatedList.firstPage(CursorPage<T> page) =>
      PaginatedList(items: page.items, nextCursor: page.nextCursor);

  final List<T> items;
  final String? nextCursor;
  final bool isLoadingMore;

  /// The error of the last failed next-page request (cleared on retry).
  final Object? loadMoreError;

  bool get hasMore => nextCursor != null && nextCursor!.isNotEmpty;

  /// Whether a next-page request may start now: more exists, none is in
  /// flight, and the last one did not fail (failures wait for an explicit
  /// retry instead of looping).
  bool get canLoadMore => hasMore && !isLoadingMore && loadMoreError == null;

  /// Same page with every item converted (mixed-role lists, OQ-026).
  PaginatedList<R> map<R>(R Function(T item) f) => PaginatedList(
        items: items.map(f).toList(),
        nextCursor: nextCursor,
        isLoadingMore: isLoadingMore,
        loadMoreError: loadMoreError,
      );

  PaginatedList<T> loadingMore() => PaginatedList(
        items: items,
        nextCursor: nextCursor,
        isLoadingMore: true,
      );

  /// Appends [page], skipping items already present (a cursor page can
  /// overlap the previous one if rows shifted between requests).
  PaginatedList<T> appended(
    CursorPage<T> page, {
    required Object Function(T item) idOf,
  }) {
    final seen = {for (final item in items) idOf(item)};
    return PaginatedList(
      items: [
        ...items,
        for (final item in page.items)
          if (seen.add(idOf(item))) item,
      ],
      nextCursor: page.nextCursor,
    );
  }

  PaginatedList<T> failedMore(Object error) => PaginatedList(
        items: items,
        nextCursor: nextCursor,
        loadMoreError: error,
      );

  PaginatedList<T> without(bool Function(T item) test) => PaginatedList(
        items: [
          for (final item in items)
            if (!test(item)) item,
        ],
        nextCursor: nextCursor,
        isLoadingMore: isLoadingMore,
        loadMoreError: loadMoreError,
      );
}
