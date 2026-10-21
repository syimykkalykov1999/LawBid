import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
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
final callHistoryProvider = AsyncNotifierProvider.autoDispose<
    CallHistoryController, PaginatedList<CallHistoryEntry>>(
  CallHistoryController.new,
);

class CallHistoryController
    extends AsyncNotifier<PaginatedList<CallHistoryEntry>> {
  /// A response of an older generation (before a refresh) is dropped.
  int _generation = 0;

  CallHistoryRepository get _repo => ref.read(callHistoryRepositoryProvider);

  @override
  Future<PaginatedList<CallHistoryEntry>> build() async =>
      PaginatedList.firstPage(await _repo.history());

  Future<void> refresh() async {
    _generation++;
    final page = await _repo.history();
    if (ref.mounted) state = AsyncData(PaginatedList.firstPage(page));
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

  Future<void> retryLoadMore() async {
    final current = state.value;
    if (current == null || current.loadMoreError == null) return;
    state = AsyncData(
      PaginatedList(items: current.items, nextCursor: current.nextCursor),
    );
    await loadMore();
  }
}

/// Group calls running now in my groups. Owner 2026-10-21: the «+» of the
/// chats glows green while one runs, so it is read while something watches
/// it: when a call event comes over the socket and every half minute (the
/// server tells only the people it rings, a group member learns of a running
/// call by asking), and the tab asks again on pull-to-refresh.
final ongoingGroupCallsProvider =
    FutureProvider.autoDispose<List<OngoingGroupCall>>((ref) {
  final events = ref.watch(realtimeEventsProvider).listen((e) {
    if (e.name.startsWith('call:')) ref.invalidateSelf();
  });
  final poll = Timer.periodic(
    const Duration(seconds: 30),
    (_) => ref.invalidateSelf(),
  );
  ref.onDispose(() {
    unawaited(events.cancel());
    poll.cancel();
  });
  return ref.watch(callHistoryRepositoryProvider).ongoing();
});

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
