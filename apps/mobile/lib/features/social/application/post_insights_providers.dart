import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
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
/// The same post's impression is sent at most once per [repeatAfter] from
/// this device (the server keeps one per viewer per 24 h anyway). An
/// assistant browsing for the attorney sends nothing.
class PostEventsQueue {
  PostEventsQueue({
    required PostEventsSender send,
    this.enabled = true,
    this.flushAfter = const Duration(seconds: 4),
    this.repeatAfter = const Duration(minutes: 30),
    DateTime Function()? now,
  })  : _send = send,
        _now = now ?? DateTime.now;

  final PostEventsSender _send;
  final DateTime Function() _now;
  final bool enabled;
  final Duration flushAfter;
  final Duration repeatAfter;

  /// The server takes at most this many in one request.
  static const maxBatch = 50;

  final _pending = <(String, PostEventKind)>[];
  final _sentAt = <String, DateTime>{};
  Timer? _timer;
  bool _disposed = false;

  @visibleForTesting
  List<(String, PostEventKind)> get pending => List.unmodifiable(_pending);

  void impression(String postId) => _add(postId, PostEventKind.impression);

  void profileVisit(String postId) =>
      _add(postId, PostEventKind.profileVisit, soon: true);

  void _add(String postId, PostEventKind kind, {bool soon = false}) {
    if (!enabled || _disposed || postId.isEmpty) return;
    final key = '$postId:${kind.name}';
    final last = _sentAt[key];
    final now = _now();
    if (last != null && now.difference(last) < repeatAfter) return;
    _sentAt[key] = now;
    _pending.add((postId, kind));
    if (_pending.length >= maxBatch) {
      unawaited(flush());
    } else if (soon) {
      _timer?.cancel();
      _timer = Timer(const Duration(milliseconds: 500), flush);
    } else {
      _timer ??= Timer(flushAfter, flush);
    }
  }

  Future<void> flush() async {
    _timer?.cancel();
    _timer = null;
    if (_pending.isEmpty || _disposed) return;
    final batch = _pending.take(maxBatch).toList();
    _pending.removeRange(0, batch.length);
    try {
      await _send(batch);
    } on Object catch (e) {
      // Best effort: statistics never get in the user's way.
      debugPrint('post events not sent: $e');
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

final postEventsQueueProvider = Provider<PostEventsQueue>((ref) {
  final repo = ref.watch(postInsightsRepositoryProvider);
  final q = PostEventsQueue(
    send: repo.record,
    enabled: !ref.watch(isAssistantProvider),
  );
  ref.onDispose(q.dispose);
  return q;
});
