import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart'
    show debugPrint, immutable, visibleForTesting;
import 'package:lawbid/core/cache/event_queue_store.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart'
    show generateIdempotencyKey;
import 'package:lawbid/features/reels/application/watch_time_meter.dart';

/// One ended reel view as `POST /posts/watch` takes it.
@immutable
class ReelWatchReport {
  const ReelWatchReport({
    required this.postId,
    required this.viewId,
    required this.watchedMs,
    required this.durationMs,
    required this.completed,
  });

  factory ReelWatchReport.fromJson(Map<String, Object?> j) => ReelWatchReport(
        postId: j['p']! as String,
        viewId: j['v']! as String,
        watchedMs: (j['w']! as num).toInt(),
        durationMs: (j['d'] as num? ?? 0).toInt(),
        completed: j['c'] == true,
      );

  final String postId;

  /// This view's own id: a retry of the same report is counted once.
  final String viewId;
  final int watchedMs;
  final int durationMs;
  final bool completed;

  Map<String, Object?> toJson() => {
        'p': postId,
        'v': viewId,
        'w': watchedMs,
        'd': durationMs,
        'c': completed,
      };
}

/// Sends a batch of ended views; replaced in tests.
typedef ReelWatchSender = Future<void> Function(List<ReelWatchReport> views);

/// The server keeps a view at most this long (ms; `REEL_WATCH_MS_MAX`).
const int kReelWatchMsMax = 3600000;

/// Owner 25.11 (TikTok / YouTube watch-time logging): each reel view, when
/// it ends, becomes ONE report — how long it really played and whether it
/// played to the end — sent in batches (like `PostEventsQueue`: one
/// request for a scroll, not one per reel). Each view carries its own id,
/// so a batch retried after a lost answer is counted once. With a store
/// the waiting reports survive a restart. A guest or an assistant sends
/// nothing (`reelWatchQueueProvider`, next to the post events queue). A
/// server that does not know the route (older than this app)
/// answers 4xx: those reports are dropped, never retried forever.
class ReelWatchQueue {
  ReelWatchQueue({
    required ReelWatchSender send,
    this.enabled = true,
    this.flushAfter = const Duration(seconds: 4),
    DateTime Function()? now,
    String Function()? newId,
    EventQueueStore? store,
  })  : _send = send,
        _store = store,
        _now = now ?? DateTime.now,
        _newId = newId ?? generateIdempotencyKey {
    if (store != null) unawaited(_restore(store));
  }

  final ReelWatchSender _send;
  final EventQueueStore? _store;
  final DateTime Function() _now;
  final String Function() _newId;
  final bool enabled;
  final Duration flushAfter;

  /// The server takes at most this many in one request.
  static const maxBatch = 50;

  /// The disk queue's kind of these rows.
  static const kind = 'reel:watch';

  final _pending = <_Row>[];
  Timer? _timer;
  bool _disposed = false;
  bool _sending = false;

  @visibleForTesting
  List<ReelWatchReport> get pending =>
      List.unmodifiable([for (final r in _pending) r.report]);

  /// Resolves once the disk queue has been read (tests).
  @visibleForTesting
  Future<void> get restored => _restored.future;
  final _restored = Completer<void>();

  /// A view of [postId] ended with [totals]; [clipMs] the clip's length.
  void ended(String postId, ReelWatchTotals totals, int clipMs) {
    if (!enabled || _disposed || postId.isEmpty || totals.watchedMs <= 0) {
      return;
    }
    final report = ReelWatchReport(
      postId: postId,
      viewId: _newId(),
      watchedMs: totals.watchedMs.clamp(0, kReelWatchMsMax),
      durationMs: clipMs.clamp(0, kReelWatchMsMax),
      completed: totals.completed,
    );
    final row = _Row(report);
    _pending.add(row);
    final store = _store;
    if (store != null) {
      unawaited(
        store.enqueue(kind, jsonEncode(report.toJson()), _now()).then((id) {
          row.rowId = id;
        }),
      );
    }
    if (_pending.length >= maxBatch) {
      unawaited(flush());
    } else {
      _timer ??= Timer(flushAfter, flush);
    }
  }

  Future<void> _restore(EventQueueStore store) async {
    final saved = await store.restore(_now());
    if (_disposed) return;
    final known = {for (final r in _pending) r.rowId};
    for (final q in saved.pending) {
      if (q.kind != kind || known.contains(q.id)) continue;
      try {
        final j = jsonDecode(q.subject) as Map<String, Object?>;
        _pending.add(_Row(ReelWatchReport.fromJson(j))..rowId = q.id);
      } on Object {
        unawaited(store.drop([q.id]));
      }
    }
    if (_pending.isNotEmpty) _timer ??= Timer(flushAfter, flush);
    _restored.complete();
  }

  Future<void> flush() async {
    _timer?.cancel();
    _timer = null;
    if (_pending.isEmpty || _disposed || _sending) return;
    final batch = _pending.take(maxBatch).toList();
    _pending.removeRange(0, batch.length);
    _sending = true;
    var done = false;
    try {
      await _send([for (final r in batch) r.report]);
      done = true;
    } on Object catch (e) {
      // A client error will not get better by retrying (an older server
      // without the route, a report it refuses): dropped. Anything else
      // (offline, 5xx) stays on disk for the next start.
      done = _permanent(e);
      debugPrint('reel watch not sent: $e');
    } finally {
      _sending = false;
    }
    if (done) {
      final ids = [
        for (final r in batch)
          if (r.rowId != null) r.rowId!,
      ];
      if (ids.isNotEmpty) unawaited(_store?.drop(ids) ?? Future.value());
    }
    if (_pending.isNotEmpty && !_disposed) {
      _timer ??= Timer(flushAfter, flush);
    }
  }

  static bool _permanent(Object e) {
    final status = switch (e) {
      ApiException(:final statusCode) => statusCode,
      DioException(:final response) => response?.statusCode,
      _ => null,
    };
    return status != null && status >= 400 && status < 500 && status != 429;
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
  }
}

class _Row {
  _Row(this.report);

  final ReelWatchReport report;
  int? rowId;
}
