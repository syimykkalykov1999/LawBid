import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/sync/sync_freshness.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

final callHistoryRepositoryProvider = Provider<CallHistoryRepository>(
  (ref) => ApiCallHistoryRepository(ref.watch(dioProvider)),
);

/// Owner 2026-10-21: the «Calls» tab list — newest first, the next page
/// loads at the list end (cursor), pull-to-refresh keeps the loaded rows
/// when it fails.
///
/// Owner 2026-11-04 (R-383, WhatsApp): opens on the phone's HTTP copy of
/// the first page (`readFromPhoneOnly`, the #702 «phoneCopy» pattern; no
/// request) and asks the server only on the first open of this app run,
/// after a call ended (socket), on pull-to-refresh or when older than
/// [SyncWindows.calls] — never on a tab switch. Kept 10 minutes after the
/// screen lets go.
///
/// B-c7 (2026-11-09, Telegram getDifference as the groups list): once a
/// page is on screen, every later sync is `?updatedSince=<syncedAt>`: only
/// the calls that reached or changed on the list come back, `deletedIds`
/// leave it, and the server's `syncedAt` is kept for the next time. The
/// first page is read only when there is nothing yet, or after a
/// `SYNC_TOO_OLD` (a gap of more than 7 days).
final callHistoryProvider = AsyncNotifierProvider.autoDispose<
    CallHistoryController, PaginatedList<CallHistoryEntry>>(
  CallHistoryController.new,
);

class CallHistoryController
    extends AsyncNotifier<PaginatedList<CallHistoryEntry>> {
  /// How long the list stays in memory after its last screen let go.
  static const keepAliveFor = Duration(minutes: 10);

  /// A saved copy slower than this is slower than the network.
  static const savedCopyTimeout = Duration(seconds: 1);

  /// A response of an older generation (before a refresh) is dropped.
  int _generation = 0;

  /// B-c7: «caught up to» (server time) of the rows on screen; null = the
  /// next sync is the first page.
  DateTime? _syncedAt;

  /// A first page carries no server time: it counts as caught up to «now»
  /// less this margin (the phone's clock may run ahead of the server's).
  static const firstPageSkew = SyncedListNotifier.firstPageSkew;

  Timer? _endedTimer;

  CallHistoryRepository get _repo => ref.read(callHistoryRepositoryProvider);

  String _key = 'calls';

  SyncFreshness get _fresh => ref.read(syncFreshnessProvider);

  @override
  Future<PaginatedList<CallHistoryEntry>> build() async {
    final account = ref.watch(sessionControllerProvider.select((s) => s?.sub));
    _key = 'calls:$account';
    _cacheFor();
    final events = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      unawaited(events.cancel());
      _endedTimer?.cancel();
    });
    final repo = _repo;
    final saved = await _phoneCopy(repo);
    if (saved == null) return PaginatedList.firstPage(await _first(repo));
    if (_fresh.isStale(_key, SyncWindows.calls)) {
      // After this build returned: the swap needs a value to replace.
      unawaited(Future<void>(refresh));
    }
    return PaginatedList.firstPage(saved);
  }

  /// The standard Riverpod «cache for» pattern (as PagedNotifier).
  void _cacheFor() {
    final link = ref.keepAlive();
    Timer? timer;
    ref
      ..onCancel(() {
        timer?.cancel();
        timer = Timer(keepAliveFor, link.close);
      })
      ..onResume(() => timer?.cancel())
      ..onDispose(() => timer?.cancel());
  }

  Future<CursorPage<CallHistoryEntry>?> _phoneCopy(
    CallHistoryRepository repo,
  ) async {
    try {
      final page = await readFromPhoneOnly(repo.history)
          .timeout(savedCopyTimeout, onTimeout: () => null);
      return page == null || page.items.isEmpty ? null : page;
    } on Object {
      return null;
    }
  }

  Future<CursorPage<CallHistoryEntry>> _first(
    CallHistoryRepository repo,
  ) async {
    final page = await repo.history();
    _fresh.mark(_key);
    _syncedAt = DateTime.now().subtract(firstPageSkew);
    return page;
  }

  /// B-c7: the delta since [_syncedAt] merged into the rows on screen —
  /// changed rows replace theirs by id, new ones join, `deletedIds` leave,
  /// newest first. Returns false when the server wants the first page
  /// again (`SYNC_TOO_OLD`) or nothing is on screen.
  Future<bool> _catchUp(PaginatedList<CallHistoryEntry> current) async {
    final since = _syncedAt;
    if (since == null) return false;
    try {
      final delta = await _repo.changed(since);
      _fresh.mark(_key);
      _syncedAt = delta.syncedAt ?? since;
      if (delta.items.isNotEmpty || delta.deletedIds.isNotEmpty) {
        _apply(current, delta);
      }
      return true;
    } on ApiException catch (e) {
      if (e.code == 'SYNC_TOO_OLD') {
        _syncedAt = null;
        return false;
      }
      rethrow;
    }
  }

  void _apply(
    PaginatedList<CallHistoryEntry> current,
    SyncedPage<CallHistoryEntry> delta,
  ) {
    final gone = delta.deletedIds.toSet();
    final changed = {for (final e in delta.items) e.id: e};
    final merged = <CallHistoryEntry>[
      for (final e in current.items)
        if (!gone.contains(e.id)) changed.remove(e.id) ?? e,
      ...changed.values.where((e) => !gone.contains(e.id)),
    ]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    state = AsyncData(
      PaginatedList(items: merged, nextCursor: current.nextCursor),
    );
  }

  void _onEvent(RealtimeEvent e) {
    // A call of mine ended (it is in the history now), or the socket was
    // away: one first-page read, a burst of events is one request.
    if (e.name == 'call:ended') {
      _fresh.forget(_key);
    } else if (e.name != RealtimeEvent.reconnected) {
      return;
    }
    _endedTimer?.cancel();
    _endedTimer = Timer(const Duration(seconds: 1), () {
      if (ref.mounted) unawaited(refreshIfStale());
    });
  }

  /// The tab came into view: the first page again only when the list is
  /// older than [SyncWindows.calls] (rows stay on screen meanwhile).
  Future<void> refreshIfStale() async {
    if (state.value == null) return;
    if (!_fresh.isStale(_key, SyncWindows.calls)) return;
    await refresh();
  }

  /// B-c7: the delta since the last sync when rows are on screen (the
  /// first page only when nothing is, or after `SYNC_TOO_OLD`); a failure
  /// keeps the rows on screen.
  Future<void> refresh() async {
    final generation = ++_generation;
    try {
      final current = state.value;
      if (current != null &&
          current.items.isNotEmpty &&
          await _catchUp(current)) {
        return;
      }
      final page = await _first(_repo);
      if (ref.mounted && generation == _generation) {
        state = AsyncData(PaginatedList.firstPage(page));
      }
    } on Object {
      // Offline / 5xx: what is shown stays; pull-to-refresh retries.
      if (state.value == null) rethrow;
    }
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.canLoadMore) return;
    state = AsyncData(current.loadingMore());
    final generation = _generation;
    try {
      final page = await _repo.history(cursor: current.nextCursor);
      if (!ref.mounted || generation != _generation) return;
      state = AsyncData(
        (state.value ?? current).appended(page, idOf: (e) => e.id),
      );
    } on Object catch (error) {
      if (!ref.mounted || generation != _generation) return;
      state = AsyncData((state.value ?? current).failedMore(error));
    }
  }

  /// Owner 2026-10-21 (WhatsApp): calls off my list — gone at once, back
  /// when the server refused.
  Future<void> hide(Set<String> ids) => _drop(
        (current) => PaginatedList(
          items: [
            for (final e in current.items)
              if (!ids.contains(e.id)) e,
          ],
          nextCursor: current.nextCursor,
        ),
        () => _repo.hide(ids.toList()),
      );

  /// «Clear»: the whole list.
  Future<void> clear() => _drop(
        (_) => const PaginatedList(items: []),
        _repo.clear,
      );

  Future<void> _drop(
    PaginatedList<CallHistoryEntry> Function(PaginatedList<CallHistoryEntry>)
        next,
    Future<void> Function() write,
  ) async {
    final current = state.value;
    if (current == null) return;
    _generation++;
    state = AsyncData(next(current));
    try {
      await write();
    } on Object {
      if (ref.mounted) state = AsyncData(current);
      rethrow;
    }
    // The phone's HTTP copy of the first page still holds the dropped
    // calls: the next cold start must not show them before the live page.
    // The rows on screen are right, so the delta stays the sync: the
    // server answers the hidden ids in deletedIds (already gone here).
    _fresh.forget(_key);
  }

  Future<void> retryLoadMore() async {
    final current = state.value;
    if (current == null || current.loadMoreError == null) return;
    state = AsyncData(
      PaginatedList(items: current.items, nextCursor: current.nextCursor),
    );
    await loadMore();
  }
}

/// Owner 2026-10-21 (WhatsApp): the calls picked in the list (null = not
/// picking). A folded line picks all its calls.
final callLogSelectionProvider =
    NotifierProvider.autoDispose<CallLogSelection, Set<String>?>(
  CallLogSelection.new,
);

class CallLogSelection extends Notifier<Set<String>?> {
  @override
  Set<String>? build() => null;

  /// Picks (or un-picks) [ids]; the last one out ends picking.
  void toggle(Iterable<String> ids) {
    final next = {...?state};
    if (ids.every(next.contains)) {
      next.removeAll(ids);
    } else {
      next.addAll(ids);
    }
    state = next.isEmpty ? null : next;
  }

  // ignore: use_setters_to_change_properties
  void set(Set<String> ids) => state = ids;

  void stop() => state = null;
}

/// Owner 2026-10-22 (load audit finding 3): with no event for this long
/// while a call is known to run, the list is read again (a lost event).
const kOngoingCallsSafetyRefresh = Duration(minutes: 5);

/// Group calls running now in my groups. Owner 2026-10-21: the «+» of the
/// chats glows green while one runs. Owner 2026-10-22 (load audit finding
/// 3): read once when watched and after a reconnect; the server then pushes
/// `call:ongoing` (started / people changed) and `call:ongoing_ended` to the
/// group's members, applied here without asking again (it used to ask every
/// 30 s). A slow safety re-read runs only while a call is known to run.
final ongoingGroupCallsProvider = AsyncNotifierProvider.autoDispose<
    OngoingGroupCallsNotifier, List<OngoingGroupCall>>(
  OngoingGroupCallsNotifier.new,
);

class OngoingGroupCallsNotifier extends AsyncNotifier<List<OngoingGroupCall>> {
  Timer? _safety;

  @override
  Future<List<OngoingGroupCall>> build() async {
    final events = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      unawaited(events.cancel());
      _safety?.cancel();
    });
    final list = await ref.watch(callHistoryRepositoryProvider).ongoing();
    _armSafety(list);
    return list;
  }

  void _onEvent(RealtimeEvent e) {
    final data = e.data;
    if (e.name == RealtimeEvent.reconnected) {
      ref.invalidateSelf();
      return;
    }
    if (data is! Map) return;
    final callId = data['callId'];
    final groupId = data['groupId'];
    // Channels' calls are not in this list (only an open channel hears
    // them).
    if (callId is! String || groupId is! String) return;
    final current = state.value;
    if (current == null) return;
    switch (e.name) {
      case 'call:ongoing':
        final i = current.indexWhere((c) => c.id == callId);
        if (i < 0) {
          // A call that just started: its title / photo come from the
          // server (one read per call, not per minute).
          ref.invalidateSelf();
          return;
        }
        final ids = data['joinedIds'];
        final me = ref.read(callMyIdProvider);
        final joined = data['joined'];
        _set([
          for (final c in current)
            if (c.id == callId)
              c.withPeople(
                joined: joined is int ? joined : c.joined,
                mine: ids is List ? ids.contains(me) : c.mine,
              )
            else
              c,
        ]);
      case 'call:ongoing_ended':
        _set([
          for (final c in current)
            if (c.id != callId && c.groupId != groupId) c,
        ]);
    }
  }

  void _set(List<OngoingGroupCall> list) {
    state = AsyncData(list);
    _armSafety(list);
  }

  void _armSafety(List<OngoingGroupCall> list) {
    _safety?.cancel();
    if (list.isEmpty) return;
    _safety = Timer(kOngoingCallsSafetyRefresh, ref.invalidateSelf);
  }
}

/// «Join» / «Return» on a running group call. Returns the API error code
/// (or [kMicDenied]), null when it worked or the call had just ended.
final joinOngoingGroupCallProvider =
    Provider<Future<String?> Function(OngoingGroupCall call)>(
  (ref) => (call) async {
    final running =
        await ref.read(callsRepositoryProvider).groupCall(call.groupId);
    if (running == null) return null;
    return ref.read(callControllerProvider.notifier).joinGroupCall(
          running,
          peer: CallPeer(
            id: call.groupId,
            isAttorney: false,
            displayName: call.groupTitle,
            avatarUrl: call.groupAvatarUrl,
          ),
        );
  },
);
