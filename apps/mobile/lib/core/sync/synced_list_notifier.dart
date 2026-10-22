import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint, protected;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// What a `?updatedSince=` answer carries (docs/perf/CLIENT_ECONOMY_API §0):
/// the changed rows, the ids that left the list and the server time to
/// pass back next time.
class SyncedPage<T> {
  const SyncedPage({
    required this.items,
    this.deletedIds = const [],
    this.syncedAt,
  });

  final List<T> items;
  final List<String> deletedIds;
  final DateTime? syncedAt;
}

/// Where a list keeps «caught up to» between runs (the cache database's
/// `sync_state`); tests use a map.
abstract interface class SyncStateStore {
  Future<DateTime?> syncedAt(String owner, String listKey);
  Future<void> setSyncedAt(String owner, String listKey, DateTime at);
  Future<void> clearSyncedAt(String owner, String listKey);
}

/// Owner 2026-10-22 (client economy plan §4, Telegram `getDifference`): a
/// paged list that is **never reloaded whole** once it is on the phone.
/// Socket events are applied to the rows ([applyRow], [removeRow]); after a
/// socket gap, a reconnect or a return to a saved copy, one
/// `?updatedSince=<syncedAt>` request brings only what changed
/// ([fetchChanged]), rows in `deletedIds` leave; `409 SYNC_TOO_OLD` means
/// a full first page again. The first page is still read as before
/// ([fetch]) when there is nothing on the phone.
abstract class SyncedListNotifier<T> extends PagedNotifier<T> {
  /// Which list this is, in `sync_state` (the owner is added by [syncStore]).
  String get listKey;

  /// The account the rows belong to (null = signed out: no sync state).
  String? get syncOwner;

  /// Persists «caught up to»; null = memory only.
  SyncStateStore? get syncStore => null;

  /// The id of a row (`deletedIds` and merges are by id).
  String keyOf(T item);

  /// `updated_at` of a row — where a catch-up starts when nothing is stored.
  DateTime? updatedAtOf(T item);

  /// The changed rows since [since] (server time).
  Future<SyncedPage<T>> fetchChanged(DateTime since);

  /// The server's order of the list, re-applied after a merge (null = changed
  /// rows stay where they were, new rows go on top).
  int Function(T a, T b)? get order => null;

  /// False for a list the server cannot send deltas for (a text search):
  /// a catch-up is then the first page again.
  bool get catchesUp => true;

  /// A first page carries no server time: it counts as caught up to «now»
  /// less this margin (the phone's clock may run ahead of the server's).
  static const firstPageSkew = Duration(minutes: 2);

  /// The clock (tests replace it).
  @protected
  DateTime now() => DateTime.now();

  @override
  Duration? get keepAliveFor => const Duration(minutes: 5);

  /// Debounce of a burst of events that need the server.
  static const catchUpDelay = Duration(milliseconds: 600);

  DateTime? _syncedAt;
  DateTime? _pullSince;
  Timer? _pullTimer;
  bool _pulling = false;

  /// The server time this list is caught up to (null until the first page
  /// or the stored value is known).
  DateTime? get syncedAt => _syncedAt;

  @override
  Future<PaginatedList<T>> build() {
    _syncedAt = null;
    _pullSince = null;
    ref.onDispose(() => _pullTimer?.cancel());
    return super.build();
  }

  /// A saved copy is on screen: catch up with one `updatedSince` instead
  /// of reading the first page again.
  @override
  Future<void> revalidateSaved(CursorPage<T> saved) async {
    final since =
        catchesUp ? (await _storedSince() ?? _sinceOf(saved.items)) : null;
    if (since == null) {
      await super.revalidateSaved(saved);
      return;
    }
    _syncedAt = since;
    await _pull(since);
  }

  @override
  Future<CursorPage<T>> fetch(String? cursor) async {
    final page = await fetchPage(cursor);
    if (cursor == null && catchesUp) {
      // A fresh first page: caught up to its newest row (or to now).
      _remember(_sinceOf(page.items) ?? now().subtract(firstPageSkew));
    }
    return page;
  }

  /// One page from the server (the subclass's old [fetch]).
  Future<CursorPage<T>> fetchPage(String? cursor);

  /// A socket event changed one row: [change] gets the current row (null =
  /// not held) and answers the new one (null = leave it). Returns false when
  /// the list does not hold [id] — the caller may [catchUp].
  @protected
  bool applyRow(String id, T? Function(T? current) change) {
    final current = state.value;
    if (current == null) return true;
    final i = current.items.indexWhere((x) => keyOf(x) == id);
    if (i < 0) return false;
    final next = change(current.items[i]);
    if (next == null) return true;
    final items = [...current.items]..[i] = next;
    final sort = order;
    if (sort != null) items.sort(sort);
    setItems(items);
    return true;
  }

  /// A socket event brought a whole row (an insert or a replacement).
  @protected
  void upsertRow(T row) {
    final current = state.value;
    if (current == null) return;
    final id = keyOf(row);
    final items = [...current.items];
    final i = items.indexWhere((x) => keyOf(x) == id);
    if (i < 0) {
      items.insert(0, row);
    } else {
      items[i] = row;
    }
    final sort = order;
    if (sort != null) items.sort(sort);
    setItems(items);
  }

  @protected
  void removeRow(String id) => removeWhere((x) => keyOf(x) == id);

  /// One `updatedSince` request for everything since [since] (or since the
  /// last catch-up), debounced: a burst of events is one request.
  void catchUp([DateTime? since]) {
    final from = catchesUp
        ? since ?? _syncedAt ?? _sinceOf(state.value?.items ?? const [])
        : null;
    if (from == null) {
      // Nothing to catch up from: the first page again.
      unawaited(refresh().catchError((Object _) {}));
      return;
    }
    final pending = _pullSince;
    _pullSince = pending == null || from.isBefore(pending) ? from : pending;
    _pullTimer?.cancel();
    _pullTimer = Timer(catchUpDelay, () {
      final s = _pullSince;
      _pullSince = null;
      if (s != null && ref.mounted) unawaited(_pull(s));
    });
  }

  Future<void> _pull(DateTime since) async {
    if (_pulling) {
      // Another pull is running: it will be followed by this one.
      _pullSince = since;
      _pullTimer ??= Timer(catchUpDelay, () {
        final s = _pullSince;
        _pullSince = null;
        _pullTimer = null;
        if (s != null && ref.mounted) unawaited(_pull(s));
      });
      return;
    }
    _pulling = true;
    try {
      final page = await fetchChanged(since);
      if (!ref.mounted) return;
      final current = state.value;
      if (current != null) setItems(merge(current.items, page));
      _remember(page.syncedAt ?? _sinceOf(page.items) ?? since);
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.syncTooOld) {
        await _forget();
        await refresh().catchError((Object _) {});
      } else {
        debugPrint('$listKey catch-up: $e');
      }
    } on Object catch (e) {
      // Offline / 5xx: the next reconnect catches up again.
      debugPrint('$listKey catch-up: $e');
    } finally {
      _pulling = false;
    }
  }

  /// Changed rows replace their old ones (or enter on top), deleted ids
  /// leave, then the server's order is re-applied.
  @protected
  List<T> merge(List<T> items, SyncedPage<T> page) {
    final deleted = page.deletedIds.toSet();
    final byId = {for (final x in page.items) keyOf(x): x};
    final out = <T>[
      for (final x in items)
        if (!deleted.contains(keyOf(x))) byId.remove(keyOf(x)) ?? x,
      ...byId.values.where((x) => !deleted.contains(keyOf(x))),
    ];
    final sort = order;
    if (sort != null) out.sort(sort);
    return out;
  }

  DateTime? _sinceOf(List<T> items) {
    DateTime? newest;
    for (final x in items) {
      final at = updatedAtOf(x);
      if (at != null && (newest == null || at.isAfter(newest))) newest = at;
    }
    // A little earlier to be safe: the server answers `>=`, rows merge by id.
    return newest?.subtract(const Duration(seconds: 2));
  }

  Future<DateTime?> _storedSince() async {
    final store = syncStore;
    final owner = syncOwner;
    if (store == null || owner == null) return null;
    try {
      return await store.syncedAt(owner, listKey);
    } on Object {
      return null;
    }
  }

  void _remember(DateTime at) {
    _syncedAt = at;
    final store = syncStore;
    final owner = syncOwner;
    if (store == null || owner == null) return;
    store.setSyncedAt(owner, listKey, at).catchError((Object _) {});
  }

  Future<void> _forget() async {
    _syncedAt = null;
    final store = syncStore;
    final owner = syncOwner;
    if (store == null || owner == null) return;
    await store.clearSyncedAt(owner, listKey).catchError((Object _) {});
  }
}
