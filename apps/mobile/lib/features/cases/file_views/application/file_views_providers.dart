import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/cases/file_views/data/file_views_repository.dart';
import 'package:lawbid/features/cases/file_views/domain/file_view.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

Duration? _noRetry(int retryCount, Object error) => null;

final fileViewsRemoteProvider = Provider<FileViewsRemote>(
  (ref) => ApiFileViewsRemote(ref.watch(dioProvider)),
);

/// This account's view lists on the phone (null signed out).
final fileViewsStoreProvider = Provider<FileViewsStore?>((ref) {
  final owner = ref.watch(sessionControllerProvider.select((s) => s?.sub));
  if (owner == null) return null;
  return FileViewsStore(ref.watch(cacheDatabaseProvider), owner);
});

/// Owner 2026-10-24: «Просмотры» of one case document, handled like the
/// chat history: the list opens from the copy on the phone at once (also
/// offline); then **only the rows newer than the newest held** are asked
/// (`?since=`, 20 per page, gzip) and put on top; older pages come when the
/// user scrolls (`cursor`). No polling: a `file:viewed` event of the server
/// or a reconnect is one more `?since=`. A full re-read never happens
/// (pull-to-refresh is the same catch-up).
class FileViewsNotifier extends PagedNotifier<FileView> {
  FileViewsNotifier(this.fileId);

  final String fileId;

  /// A catch-up that needs more pages than this means the copy is far
  /// behind: it is dropped and the first page read again.
  static const maxCatchUpPages = 10;

  /// Debounce of a burst of events.
  static const eventDelay = Duration(milliseconds: 600);

  Timer? _timer;
  bool _catching = false;

  FileViewsStore? get _store => ref.read(fileViewsStoreProvider);

  FileViewsRemote get _remote => ref.read(fileViewsRemoteProvider);

  @override
  Duration? get keepAliveFor => const Duration(minutes: 2);

  @override
  Object idOf(FileView item) => item.id;

  @override
  Future<PaginatedList<FileView>> build() {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == RealtimeEvent.reconnected || _viewedThisFile(e)) {
        _scheduleCatchUp();
      }
    });
    ref.onDispose(() {
      sub.cancel();
      _timer?.cancel();
    });
    return super.build();
  }

  bool _viewedThisFile(RealtimeEvent e) {
    if (e.name != 'file:viewed') return false;
    final d = e.data;
    final ids = d is Map ? d['fileIds'] : null;
    return ids is List && ids.contains(fileId);
  }

  void _scheduleCatchUp() {
    _timer?.cancel();
    _timer = Timer(eventDelay, () {
      if (ref.mounted) unawaited(catchUp());
    });
  }

  @override
  Future<CursorPage<FileView>?> cachedFirstPage() async {
    final held = await _store?.read(fileId);
    if (held == null || held.rows.isEmpty) return null;
    return CursorPage(items: held.rows, nextCursor: held.olderCursor);
  }

  /// The held rows are on screen: ask only what is newer.
  @override
  Future<void> revalidateSaved(CursorPage<FileView> saved) => catchUp();

  /// First page (null cursor): from the server when nothing is held, else
  /// the catch-up merged with what is held. Older page: from the server.
  @override
  Future<CursorPage<FileView>> fetch(String? cursor) async {
    if (cursor != null) return _older(cursor);
    final held = await _store?.read(fileId);
    if (held != null && held.rows.isNotEmpty && held.newestAt != null) {
      final fresh = await _newerThan(held.newestAt!);
      if (fresh != null) {
        return CursorPage(
          items: _merge(held.rows, fresh),
          nextCursor: held.olderCursor,
        );
      }
    }
    return _firstPage();
  }

  Future<CursorPage<FileView>> _firstPage() async {
    final page = await _remote.page(fileId);
    await _store?.forget(fileId);
    await _store?.save(
      fileId,
      page.items,
      newest: page.items.isEmpty ? null : page.items.first.viewedAt,
      olderCursor: page.nextCursor,
      setOlderCursor: true,
    );
    return CursorPage(items: page.items, nextCursor: page.nextCursor);
  }

  Future<CursorPage<FileView>> _older(String cursor) async {
    final page = await _remote.page(fileId, cursor: cursor);
    final store = _store;
    if (store != null) {
      // Past the per-file cap nothing more is kept (and the older cursor
      // stays where it was, below the last kept row).
      final kept = await store.count(fileId);
      if (kept + page.items.length <= FileViewsStore.maxPerFile) {
        await store.save(
          fileId,
          page.items,
          olderCursor: page.nextCursor,
          setOlderCursor: true,
        );
      }
    }
    return CursorPage(items: page.items, nextCursor: page.nextCursor);
  }

  /// Every row newer than [since], saved in one go (the cursor moves only
  /// when all pages arrived). Null = too far behind: the caller reads the
  /// first page instead.
  Future<List<FileView>?> _newerThan(DateTime since) async {
    final out = <FileView>[];
    String? cursor;
    for (var i = 0; i < maxCatchUpPages; i++) {
      final page = await _remote.page(fileId, since: since, cursor: cursor);
      out.addAll(page.items);
      cursor = page.nextCursor;
      if (cursor == null) {
        if (out.isNotEmpty) {
          await _store?.save(fileId, out, newest: out.first.viewedAt);
        }
        return out;
      }
    }
    return null;
  }

  List<FileView> _merge(List<FileView> held, List<FileView> fresh) {
    final byId = {for (final v in held) v.id: v};
    for (final v in fresh) {
      byId[v.id] = v;
    }
    return byId.values.toList()..sort(compareFileViews);
  }

  /// One `?since=` catch-up on top of what is shown; failures (offline,
  /// 5xx) leave the list as it is.
  Future<void> catchUp() async {
    if (_catching) return;
    _catching = true;
    try {
      final shown = state.value;
      final held = await _store?.read(fileId);
      final since = held?.newestAt ??
          (shown == null || shown.items.isEmpty
              ? null
              : shown.items.first.viewedAt);
      if (since == null) return;
      final fresh = await _newerThan(since);
      if (!ref.mounted) return;
      if (fresh == null) {
        await _store?.forget(fileId);
        await refresh();
        return;
      }
      if (fresh.isEmpty) return;
      final now = state.value;
      if (now != null) setItems(_merge(now.items, fresh));
    } on Object catch (e) {
      debugPrint('file views catch-up: $e');
    } finally {
      _catching = false;
    }
  }
}

final fileViewsProvider = AsyncNotifierProvider.autoDispose
    .family<FileViewsNotifier, PaginatedList<FileView>, String>(
  FileViewsNotifier.new,
  retry: _noRetry,
);
