import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/event_queue_store.dart';
import 'package:lawbid/features/cases/application/case_views_queue.dart';
import 'package:lawbid/features/social/application/post_insights_providers.dart';
import 'package:lawbid/features/social/data/post_insights_repository.dart';

/// Owner 2026-10-22 (client economy plan, package A): views are batched
/// with the other post events, the queue survives a restart, and a case
/// view goes in one request with the others.
void main() {
  late CacheDatabase db;

  setUp(() => db = CacheDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('20 views become one POST', () async {
    final sent = <List<(String, PostEventKind)>>[];
    final q = PostEventsQueue(
      send: (e) async => sent.add(e),
      flushAfter: const Duration(milliseconds: 10),
    );
    for (var i = 0; i < 20; i++) {
      q.view('p$i');
    }
    expect(q.pending.length, 20);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(sent.length, 1);
    expect(sent.single.length, 20);
    expect(sent.single.first, ('p0', PostEventKind.view));
    q.dispose();
  });

  test('the queue and the «sent at» marks survive a restart', () async {
    var now = DateTime(2026, 10, 22, 12);
    final sent = <List<(String, PostEventKind)>>[];
    final first = PostEventsQueue(
      send: (e) async => sent.add(e),
      store: DriftEventQueueStore(db, 'u1'),
      flushAfter: const Duration(hours: 1), // never flushes in this test
      now: () => now,
    );
    await first.restored;
    first
      ..view('a')
      ..impression('b');
    // Let the disk writes land.
    await Future<void>.delayed(const Duration(milliseconds: 50));
    first.dispose(); // «killed» before the flush

    now = now.add(const Duration(minutes: 5));
    final second = PostEventsQueue(
      send: (e) async => sent.add(e),
      store: DriftEventQueueStore(db, 'u1'),
      flushAfter: const Duration(milliseconds: 10),
      now: () => now,
    );
    await second.restored;
    expect(second.pending, [
      ('a', PostEventKind.view),
      ('b', PostEventKind.impression),
    ]);
    // Seen again within 30 minutes: not queued twice after the restart.
    second.view('a');
    expect(second.pending.length, 2);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(sent.length, 1);
    // Sent rows left the disk.
    expect((await db.queuedEvents('u1')).length, 0);
    second.dispose();
  });

  test("another account does not see the first one's queue", () async {
    final q = PostEventsQueue(
      send: (_) async {},
      store: DriftEventQueueStore(db, 'u1'),
      flushAfter: const Duration(hours: 1),
    );
    await q.restored;
    q.view('a');
    await Future<void>.delayed(const Duration(milliseconds: 30));
    final other = PostEventsQueue(
      send: (_) async {},
      store: DriftEventQueueStore(db, 'u2'),
      flushAfter: const Duration(hours: 1),
    );
    await other.restored;
    expect(other.pending, isEmpty);
    q.dispose();
    other.dispose();
  });

  test('the disk queue never grows past 500 rows', () async {
    final now = DateTime(2026);
    for (var i = 0; i < 520; i++) {
      await db.enqueueEvent(
        owner: 'u',
        kind: 'post:view',
        subject: '$i',
        now: now,
      );
    }
    final rows = await db.queuedEvents('u', limit: 1000);
    expect(rows.length, 500);
    expect(rows.first.subject, '20'); // the oldest went first
  });

  test('case views: several opened cases go in one request', () async {
    final sent = <List<String>>[];
    final q = CaseViewsQueue(
      send: (ids) async => sent.add(ids),
      flushAfter: const Duration(milliseconds: 10),
    )
      ..view('c1')
      ..view('c2')
      ..view('c1');
    expect(q.pending, ['c1', 'c2']);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(sent, [
      ['c1', 'c2'],
    ]);
    q.dispose();
  });

  test('case views survive a restart', () async {
    final a = CaseViewsQueue(
      send: (_) async {},
      store: DriftEventQueueStore(db, 'u1'),
      flushAfter: const Duration(hours: 1),
    )..view('c9');
    await Future<void>.delayed(const Duration(milliseconds: 30));
    a.dispose();
    final sent = <List<String>>[];
    final b = CaseViewsQueue(
      send: (ids) async => sent.add(ids),
      store: DriftEventQueueStore(db, 'u1'),
      flushAfter: const Duration(milliseconds: 10),
    );
    await Future<void>.delayed(const Duration(milliseconds: 60));
    expect(sent, [
      ['c9'],
    ]);
    b.dispose();
  });
}
