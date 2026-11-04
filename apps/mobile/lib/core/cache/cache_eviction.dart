import 'package:flutter/foundation.dart';

/// One cached item as the eviction policy sees it.
@immutable
class EvictionEntry {
  const EvictionEntry({
    required this.pool,
    required this.lastUsed,
    required this.bytes,
    this.ref,
  });

  /// Which store it is in (images, chat media, video…).
  final String pool;

  /// What the owner of the entry needs to delete it (a `File`, a key).
  final Object? ref;
  final DateTime lastUsed;
  final int bytes;
}

/// Owner 2026-11-03 (cache like Telegram, «Максимальный размер кэша»):
/// which entries go when all cached media together pass [capBytes] — the
/// least recently used first, across every pool, until what is left fits.
/// Answers the victims in the order they should be deleted; empty when the
/// cache already fits or has no cap ([capBytes] null).
List<EvictionEntry> planCapEviction(
  Iterable<EvictionEntry> entries,
  int? capBytes,
) {
  if (capBytes == null) return const [];
  final all = entries.toList();
  var total = all.fold<int>(0, (a, e) => a + e.bytes);
  if (total <= capBytes) return const [];
  // Stable for equal times: the pool name decides, so two runs agree.
  all.sort((a, b) {
    final c = a.lastUsed.compareTo(b.lastUsed);
    return c != 0 ? c : a.pool.compareTo(b.pool);
  });
  final victims = <EvictionEntry>[];
  for (final e in all) {
    if (total <= capBytes) break;
    victims.add(e);
    total -= e.bytes;
  }
  return victims;
}

/// Entries not used since [cutoff] (the auto-delete age), oldest first.
List<EvictionEntry> planAgeEviction(
  Iterable<EvictionEntry> entries,
  DateTime cutoff,
) =>
    [
      for (final e in entries)
        if (e.lastUsed.isBefore(cutoff)) e,
    ]..sort((a, b) => a.lastUsed.compareTo(b.lastUsed));
