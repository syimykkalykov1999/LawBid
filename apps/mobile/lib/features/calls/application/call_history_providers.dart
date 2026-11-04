import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/sync/sync_freshness.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/data/call_history_cache.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

final callHistoryCacheProvider = Provider<CallHistoryCache>(
  (ref) => CallHistoryCache(ref.watch(savedJsonProvider)),
);

final callHistoryRepositoryProvider = Provider<CallHistoryRepository>(
  (ref) => ApiCallHistoryRepository(
    ref.watch(dioProvider),
    cache: ref.watch(callHistoryCacheProvider),
  ),
);

/// Owner 2026-10-21: the «Calls» tab list — newest first, the next page
/// loads at the list end (cursor), pull-to-refresh keeps the loaded rows
/// when it fails.
///
/// Owner 2026-11-04 (R-383, WhatsApp): opens on the copy saved on the phone
/// and asks the server only on the first open of this app run, after a call
/// ended (socket), on pull-to-refresh or when older than
/// [SyncWindows.calls] — never on a tab switch. The server has no
/// `updatedSince` for this list: a sync is the first page again.
final callHistoryProvider = AsyncNotifierProvider.autoDispose<
    CallHistoryController, PaginatedList<CallHistoryEntry>>(
  CallHistoryController.new,
);

class CallHistoryController extends PagedNotifier<CallHistoryEntry> {
  CallHistoryRepository get _repo => ref.read(callHistoryRepositoryProvider);

  Timer? _endedTimer;

  String get _key => 'calls:${ref.read(currentUserIdProvider)}';

  SyncFreshness get _fresh => ref.read(syncFreshnessProvider);

  @override
  Duration? get keepAliveFor => const Duration(minutes: 10);

  @override
  Future<PaginatedList<CallHistoryEntry>> build() {
    ref.watch(currentUserIdProvider);
    final events = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      unawaited(events.cancel());
      _endedTimer?.cancel();
    });
    return super.build();
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

  @override
  Future<CursorPage<CallHistoryEntry>?> cachedFirstPage() =>
      ref.read(callHistoryCacheProvider).read();

  @override
  Future<void> revalidateSaved(CursorPage<CallHistoryEntry> saved) async {
    if (!_fresh.isStale(_key, SyncWindows.calls)) return;
    await super.revalidateSaved(saved);
  }

  @override
  Future<CursorPage<CallHistoryEntry>> fetch(String? cursor) async {
    final page = await _repo.history(cursor: cursor);
    if (cursor == null) _fresh.mark(_key);
    return page;
  }

  @override
  Object idOf(CallHistoryEntry item) => item.id;

  /// The tab came into view: the first page again only when the list is
  /// older than [SyncWindows.calls] (rows stay on screen meanwhile).
  Future<void> refreshIfStale() async {
    if (!_fresh.isStale(_key, SyncWindows.calls)) return;
    if (state.value == null) return;
    await refresh();
  }

  /// Owner 2026-10-21 (WhatsApp): calls off my list — gone at once, back
  /// when the server refused.
  Future<void> hide(Set<String> ids) => _drop(
        (current) => current.without((e) => ids.contains(e.id)),
        () => _repo.hide(ids.toList()),
        ids.contains,
      );

  /// «Clear»: the whole list.
  Future<void> clear() => _drop(
        (_) => const PaginatedList(items: []),
        _repo.clear,
        (_) => true,
      );

  Future<void> _drop(
    PaginatedList<CallHistoryEntry> Function(PaginatedList<CallHistoryEntry>)
        next,
    Future<void> Function() write,
    bool Function(String id) gone,
  ) async {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(next(current));
    try {
      await write();
    } on Object {
      if (ref.mounted) state = AsyncData(current);
      rethrow;
    }
    await ref.read(callHistoryCacheProvider).drop(gone);
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
