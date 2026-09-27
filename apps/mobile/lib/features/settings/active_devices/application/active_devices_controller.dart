import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/settings/active_devices/active_devices_providers.dart';
import 'package:lawbid/features/settings/active_devices/domain/active_devices_repository.dart';
import 'package:lawbid/features/settings/active_devices/domain/device_session_info.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Drives `/profile/settings/devices` (docs/01 §10.4 "Активные
/// устройства"): first page on build, cursor pagination ([loadMore] /
/// [retryLoadMore]), pull-to-refresh that keeps the loaded rows on failure
/// (docs/01 §8.3 "показ кэша"), and the revoke / sign-out-everywhere
/// actions. Depends on the domain repository only.
final activeDevicesControllerProvider = AsyncNotifierProvider.autoDispose<
    ActiveDevicesController, PaginatedList<DeviceSessionInfo>>(
  ActiveDevicesController.new,
  // No silent automatic retries (Riverpod 3 retries failing providers by
  // default): a failed load must surface the error/offline state with its
  // Retry button right away (docs/01 §8.3); the offline banner's own
  // backoff probe handles reconnection.
  retry: (retryCount, error) => null,
);

class ActiveDevicesController
    extends AsyncNotifier<PaginatedList<DeviceSessionInfo>> {
  ActiveDevicesRepository get _repo =>
      ref.read(activeDevicesRepositoryProvider);

  static Object _id(DeviceSessionInfo s) => s.sessionId;

  @override
  Future<PaginatedList<DeviceSessionInfo>> build() async {
    final repo = ref.watch(activeDevicesRepositoryProvider);
    return PaginatedList.firstPage(await repo.fetchPage());
  }

  /// Reloads from the first page. With rows already on screen, a failure
  /// keeps them and rethrows (the screen shows a snackbar; the global
  /// banner covers "offline"); from the error/empty state it goes through
  /// loading → data/error like the first load.
  Future<void> refresh() async {
    final previous = state.value;
    if (previous == null) {
      state = const AsyncLoading();
      state = await AsyncValue.guard(
        () async => PaginatedList.firstPage(await _repo.fetchPage()),
      );
      return;
    }
    final page = await _repo.fetchPage();
    state = AsyncData(PaginatedList.firstPage(page));
  }

  /// Fetches the next page if one exists and none is in flight or failed.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.canLoadMore) return;
    state = AsyncData(current.loadingMore());
    try {
      final page = await _repo.fetchPage(cursor: current.nextCursor);
      final latest = state.value ?? current;
      state = AsyncData(latest.appended(page, idOf: _id));
    } on Object catch (error) {
      final latest = state.value ?? current;
      state = AsyncData(latest.failedMore(error));
    }
  }

  /// The footer's Retry after a failed [loadMore].
  Future<void> retryLoadMore() async {
    final current = state.value;
    if (current == null || current.loadMoreError == null) return;
    state = AsyncData(
      PaginatedList(items: current.items, nextCursor: current.nextCursor),
    );
    await loadMore();
  }

  /// Ends [sessionId] and drops it from the list locally (no refetch —
  /// that would throw away pages already loaded). If it is the current
  /// session, the caller must also clear local session state and route to
  /// Welcome. Errors propagate to the caller.
  Future<void> revoke(String sessionId) async {
    await _repo.revoke(sessionId);
    final current = state.value;
    if (current != null) {
      state = AsyncData(current.without((s) => s.sessionId == sessionId));
    }
  }

  /// Signs out of every device; the caller clears the local session.
  Future<void> logoutAll() => _repo.logoutAll();
}
