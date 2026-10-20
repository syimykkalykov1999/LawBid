/// Owner 2026-10-18: one newest-first list built from several paged
/// sources, each already newest first (the attorney profile's
/// «Брифы и репосты» tab: their briefs + their reposts).
///
/// The rule that keeps load-more honest: an item is shown only once no
/// source that still has unloaded pages could hold a newer one — i.e. its
/// time is not older than the [MergeSource.boundary] of every other source
/// with more pages. Anything older waits (it stays loaded, it is not
/// dropped) until that source loads its next page, so paging never skips
/// an item, and an id seen once is never shown again.
library;

/// One paged source of a merged list.
class MergeSource<T> {
  const MergeSource({
    required this.items,
    required this.hasMore,
    required this.boundary,
  });

  /// The loaded items to show, newest first, each with its time.
  final List<(T, DateTime)> items;

  /// Whether the source has unloaded pages.
  final bool hasMore;

  /// The time of the oldest item the source has loaded (before any
  /// display filter) — every unloaded item is at most this new. Null with
  /// nothing loaded: then all of it is still to come.
  final DateTime? boundary;
}

/// A merged entry: the item and the index of the source it came from.
typedef MergedEntry<T> = ({T item, int source});

class MergedPage<T> {
  const MergedPage({required this.entries, required this.nextSource});

  /// What to show now, newest first.
  final List<MergedEntry<T>> entries;

  /// The source to load next (the one holding back the oldest shown items:
  /// the newest boundary among sources with more pages); null = everything
  /// is loaded.
  final int? nextSource;

  bool get hasMore => nextSource != null;
}

/// Merges [sources] newest first (ties: the lower source index first).
/// [idOf] de-duplicates across sources (the first one seen wins).
MergedPage<T> mergeNewestFirst<T>(
  List<MergeSource<T>> sources, {
  required Object Function(T item) idOf,
}) {
  // The newest point below which a source with more pages may still add
  // items; nothing older than it may be shown yet.
  DateTime? cut;
  var cutAll = false; // a source with more pages and nothing loaded
  int? next;
  for (var i = 0; i < sources.length; i++) {
    final s = sources[i];
    if (!s.hasMore) continue;
    final b = s.boundary;
    if (b == null) {
      if (!cutAll) next = i;
      cutAll = true;
      continue;
    }
    if (cutAll) continue;
    if (cut == null || b.isAfter(cut)) {
      cut = b;
      next = i;
    }
  }

  final all = <(T, DateTime, int)>[
    for (var i = 0; i < sources.length; i++)
      for (final (item, at) in sources[i].items) (item, at, i),
  ];
  // Stable: equal times keep source order, then each source's own order.
  final indexed = [for (var k = 0; k < all.length; k++) (all[k], k)]
    ..sort((a, b) {
      final byTime = b.$1.$2.compareTo(a.$1.$2);
      if (byTime != 0) return byTime;
      final bySource = a.$1.$3.compareTo(b.$1.$3);
      return bySource != 0 ? bySource : a.$2.compareTo(b.$2);
    });

  final seen = <Object>{};
  final entries = <MergedEntry<T>>[];
  for (final ((item, at, source), _) in indexed) {
    if (cutAll) break;
    if (cut != null && at.isBefore(cut)) break;
    if (seen.add(idOf(item))) entries.add((item: item, source: source));
  }
  return MergedPage(entries: entries, nextSource: next);
}

/// Times for a source whose items come newest first but may not carry
/// their own list time: [exact] when known, else the estimate clamped so
/// the sequence never gets newer again (the merge needs each source in
/// order). Stable while pages are appended.
List<DateTime> monotoneTimes<T>(
  List<T> items, {
  required DateTime? Function(T item) exact,
  required DateTime Function(T item) estimate,
}) {
  final out = <DateTime>[];
  for (final item in items) {
    var at = exact(item) ?? estimate(item);
    if (out.isNotEmpty && at.isAfter(out.last)) at = out.last;
    out.add(at);
  }
  return out;
}
