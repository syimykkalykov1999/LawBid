import 'package:drift/drift.dart' show OrderingTerm;
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/cache_database.dart';

/// A queued statistics event on disk (plan §4 package A): [kind] is
/// `post:view`, `post:impression`, `post:profile_visit` or `case:view`.
@immutable
class QueuedEvent {
  const QueuedEvent({
    required this.id,
    required this.kind,
    required this.subject,
  });

  final int id;
  final String kind;
  final String subject;
}

/// The disk side of an events batcher: the queue survives a kill between
/// two flushes, and «sent at» survives a restart (no second view of the
/// same post within the repeat window). Every method swallows its own
/// failure — statistics never get in the user's way.
abstract interface class EventQueueStore {
  /// Rows waiting to be sent, oldest first, with the dedup marks still
  /// valid at [now] (`key → until`).
  Future<({List<QueuedEvent> pending, Map<String, DateTime> sent})> restore(
    DateTime now,
  );

  Future<int?> enqueue(String kind, String subject, DateTime now);
  Future<void> markSent(String key, DateTime until);
  Future<void> drop(Iterable<int> ids);
}

class DriftEventQueueStore implements EventQueueStore {
  DriftEventQueueStore(this._db, this._owner);

  final CacheDatabase _db;
  final String _owner;

  @override
  Future<({List<QueuedEvent> pending, Map<String, DateTime> sent})> restore(
    DateTime now,
  ) async {
    try {
      await _db.dropExpiredDedup(now);
      final rows = await _db.queuedEvents(_owner, limit: 500);
      final marks = await (_db.select(_db.eventDedup)
            ..where((r) => r.owner.equals(_owner)))
          .get();
      return (
        pending: [
          for (final r in rows)
            QueuedEvent(id: r.id, kind: r.kind, subject: r.subject),
        ],
        sent: {for (final m in marks) m.key: m.until},
      );
    } on Object catch (e) {
      debugPrint('events queue restore: $e');
      return (pending: const <QueuedEvent>[], sent: const <String, DateTime>{});
    }
  }

  @override
  Future<int?> enqueue(String kind, String subject, DateTime now) async {
    try {
      await _db.enqueueEvent(
        owner: _owner,
        kind: kind,
        subject: subject,
        now: now,
      );
      final last = await (_db.select(_db.eventsQueue)
            ..where((r) => r.owner.equals(_owner))
            ..orderBy([(r) => OrderingTerm.desc(r.id)])
            ..limit(1))
          .getSingleOrNull();
      return last?.id;
    } on Object catch (e) {
      debugPrint('events queue write: $e');
      return null;
    }
  }

  @override
  Future<void> markSent(String key, DateTime until) async {
    try {
      await _db.setDedup(_owner, key, until);
    } on Object catch (e) {
      debugPrint('events dedup write: $e');
    }
  }

  @override
  Future<void> drop(Iterable<int> ids) async {
    try {
      await _db.dropEvents(ids);
    } on Object catch (e) {
      debugPrint('events queue drop: $e');
    }
  }
}
