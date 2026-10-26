import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/event_queue_store.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;
import 'package:lawbid/features/social/data/post_insights_repository.dart';
import 'package:lawbid/features/social/domain/post_insights_models.dart';
import 'package:lawbid/features/team/application/team_providers.dart'
    show isAssistantProvider;

final postInsightsRepositoryProvider = Provider<PostInsightsRepository>(
  (ref) => PostInsightsRepository(ref.watch(dioProvider)),
);

/// `GET /posts/:id/insights` — the author's numbers of one post.
final postInsightsProvider =
    FutureProvider.autoDispose.family<PostInsights, String>(
  (ref, postId) => ref.watch(postInsightsRepositoryProvider).insights(postId),
);

/// Sends a batch of events; replaced in tests.
typedef PostEventsSender = Future<void> Function(
  List<(String, PostEventKind)> events,
);

/// Owner 2026-10-18: impressions (a card ≥ 50 % on screen for about a
/// second) and profile visits from a post, collected and sent in batches.
/// Owner 2026-10-22 (client economy plan, package A): views ride in the
/// same batch (`kind: view`) instead of one `POST /posts/{id}/view` per
/// post — the app's chattiest request is gone. The same post's event is
/// sent at most once per [repeatAfter] from this device (the server keeps
/// one per viewer per 24 h anyway); with a store both the queue and the
/// «sent at» marks survive a restart. An assistant browsing for the
/// attorney sends nothing.
class PostEventsQueue {
  PostEventsQueue({
    required PostEventsSender send,
    this.enabled = true,
    this.flushAfter = const Duration(seconds: 4),
    this.repeatAfter = const Duration(minutes: 30),
    DateTime Function()? now,
    EventQueueStore? store,
  })  : _send = send,
        _store = store,
        _now = now ?? DateTime.now {
    if (store != null) unawaited(_restore(store));
  }

  final PostEventsSender _send;
  final EventQueueStore? _store;
  final DateTime Function() _now;
  final bool enabled;
  final Duration flushAfter;
  final Duration repeatAfter;

  /// The server takes at most this many in one request.
  static const maxBatch = 50;

  static const _kindPrefix = 'post:';

  final _pending = <_Pending>[];
  final _sentAt = <String, DateTime>{};
  Timer? _timer;
  bool _disposed = false;
  bool _sending = false;

  @visibleForTesting
  List<(String, PostEventKind)> get pending =>
      List.unmodifiable([for (final p in _pending) (p.postId, p.kind)]);

  /// Resolves once the disk queue has been read (tests).
  @visibleForTesting
  Future<void> get restored => _restored.future;
  final _restored = Completer<void>();

  void impression(String postId) => _add(postId, PostEventKind.impression);

  void profileVisit(String postId) =>
      _add(postId, PostEventKind.profileVisit, soon: true);

  /// A post was looked at (feed: ≥ 50 % on screen for a second; reel: 3 s
  /// of playback).
  void view(String postId) => _add(postId, PostEventKind.view);

  void _add(String postId, PostEventKind kind, {bool soon = false}) {
    if (!enabled || _disposed || postId.isEmpty) return;
    final key = '$postId:${kind.name}';
    final last = _sentAt[key];
    final now = _now();
    if (last != null && now.difference(last) < repeatAfter) return;
    _sentAt[key] = now;
    final row = _Pending(postId, kind);
    _pending.add(row);
    final store = _store;
    if (store != null) {
      unawaited(store.markSent(key, now.add(repeatAfter)));
      unawaited(
        store.enqueue('$_kindPrefix${kind.wire}', postId, now).then((id) {
          row.rowId = id;
        }),
      );
    }
    _schedule(soon: soon);
  }

  void _schedule({bool soon = false}) {
    if (_pending.length >= maxBatch) {
      unawaited(flush());
    } else if (soon) {
      _timer?.cancel();
      _timer = Timer(const Duration(milliseconds: 500), flush);
    } else {
      _timer ??= Timer(flushAfter, flush);
    }
  }

  Future<void> _restore(EventQueueStore store) async {
    final saved = await store.restore(_now());
    if (_disposed) return;
    for (final e in saved.sent.entries) {
      _sentAt.putIfAbsent(e.key, () => e.value.subtract(repeatAfter));
    }
    final known = {for (final p in _pending) p.rowId};
    for (final q in saved.pending) {
      if (!q.kind.startsWith(_kindPrefix) || known.contains(q.id)) continue;
      final kind = PostEventKind.fromWire(q.kind.substring(_kindPrefix.length));
      if (kind == null) continue;
      _pending.add(_Pending(q.subject, kind)..rowId = q.id);
    }
    if (_pending.isNotEmpty) _schedule();
    _restored.complete();
  }

  Future<void> flush() async {
    _timer?.cancel();
    _timer = null;
    if (_pending.isEmpty || _disposed || _sending) return;
    final batch = _pending.take(maxBatch).toList();
    _pending.removeRange(0, batch.length);
    _sending = true;
    try {
      await _send([for (final p in batch) (p.postId, p.kind)]);
      final ids = [
        for (final p in batch)
          if (p.rowId != null) p.rowId!,
      ];
      if (ids.isNotEmpty) unawaited(_store?.drop(ids) ?? Future.value());
    } on Object catch (e) {
      // Best effort: statistics never get in the user's way. The rows stay
      // on disk for the next start.
      debugPrint('post events not sent: $e');
    } finally {
      _sending = false;
    }
    if (_pending.isNotEmpty && !_disposed) {
      _timer ??= Timer(flushAfter, flush);
    }
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
  }
}

class _Pending {
  _Pending(this.postId, this.kind);

  final String postId;
  final PostEventKind kind;
  int? rowId;
}

final postEventsQueueProvider = Provider<PostEventsQueue>((ref) {
  final repo = ref.watch(postInsightsRepositoryProvider);
  final owner = ref.watch(currentUserIdProvider);
  final q = PostEventsQueue(
    send: repo.record,
    // Owner 2026-10-22: a guest's looks are not counted (the write routes
    // need an account).
    enabled: !ref.watch(isAssistantProvider) && !ref.watch(isGuestProvider),
    store: owner == null
        ? null
        : DriftEventQueueStore(ref.watch(cacheDatabaseProvider), owner),
  );
  ref.onDispose(q.dispose);
  return q;
});
