import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/event_queue_store.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart'
    show casesRepositoryProvider;
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;

/// Sends a batch of case ids; replaced in tests.
typedef CaseViewsSender = Future<void> Function(List<String> caseIds);

/// Owner 2026-10-22 (client economy plan, package A): opened cases are
/// counted in one `POST /cases/views` every [flushAfter] instead of one
/// request per case; a case is sent at most once per [repeatAfter] from
/// this device (the server dedups per attorney and case anyway). With a
/// store the queue survives a kill between two flushes.
class CaseViewsQueue {
  CaseViewsQueue({
    required CaseViewsSender send,
    this.flushAfter = const Duration(seconds: 4),
    this.repeatAfter = const Duration(minutes: 30),
    DateTime Function()? now,
    EventQueueStore? store,
  })  : _send = send,
        _store = store,
        _now = now ?? DateTime.now {
    if (store != null) unawaited(_restore(store));
  }

  static const maxBatch = 50;
  static const kind = 'case:view';

  final CaseViewsSender _send;
  final EventQueueStore? _store;
  final DateTime Function() _now;
  final Duration flushAfter;
  final Duration repeatAfter;

  final _pending = <_Row>[];
  final _sentAt = <String, DateTime>{};
  Timer? _timer;
  bool _disposed = false;
  bool _sending = false;

  @visibleForTesting
  List<String> get pending => [for (final r in _pending) r.caseId];

  void view(String caseId) {
    if (_disposed || caseId.isEmpty) return;
    final now = _now();
    final last = _sentAt[caseId];
    if (last != null && now.difference(last) < repeatAfter) return;
    _sentAt[caseId] = now;
    final row = _Row(caseId);
    _pending.add(row);
    final store = _store;
    if (store != null) {
      unawaited(store.markSent('$kind:$caseId', now.add(repeatAfter)));
      unawaited(store.enqueue(kind, caseId, now).then((id) => row.rowId = id));
    }
    _schedule();
  }

  void _schedule() {
    if (_pending.length >= maxBatch) {
      unawaited(flush());
    } else {
      _timer ??= Timer(flushAfter, flush);
    }
  }

  Future<void> _restore(EventQueueStore store) async {
    final saved = await store.restore(_now());
    if (_disposed) return;
    const prefix = '$kind:';
    for (final e in saved.sent.entries) {
      if (!e.key.startsWith(prefix)) continue;
      _sentAt.putIfAbsent(
        e.key.substring(prefix.length),
        () => e.value.subtract(repeatAfter),
      );
    }
    final known = {for (final r in _pending) r.rowId};
    for (final q in saved.pending) {
      if (q.kind != kind || known.contains(q.id)) continue;
      _pending.add(_Row(q.subject)..rowId = q.id);
    }
    if (_pending.isNotEmpty) _schedule();
  }

  Future<void> flush() async {
    _timer?.cancel();
    _timer = null;
    if (_pending.isEmpty || _disposed || _sending) return;
    final batch = _pending.take(maxBatch).toList();
    _pending.removeRange(0, batch.length);
    _sending = true;
    try {
      await _send({for (final r in batch) r.caseId}.toList());
      final ids = [
        for (final r in batch)
          if (r.rowId != null) r.rowId!,
      ];
      if (ids.isNotEmpty) unawaited(_store?.drop(ids) ?? Future.value());
    } on Object catch (e) {
      debugPrint('case views not sent: $e');
    } finally {
      _sending = false;
    }
    if (_pending.isNotEmpty && !_disposed) _timer ??= Timer(flushAfter, flush);
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
  }
}

class _Row {
  _Row(this.caseId);

  final String caseId;
  int? rowId;
}

final caseViewsQueueProvider = Provider<CaseViewsQueue>((ref) {
  final owner = ref.watch(currentUserIdProvider);
  final q = CaseViewsQueue(
    send: ref.watch(casesRepositoryProvider).recordViews,
    store: owner == null
        ? null
        : DriftEventQueueStore(ref.watch(cacheDatabaseProvider), owner),
  );
  ref.onDispose(q.dispose);
  return q;
});
