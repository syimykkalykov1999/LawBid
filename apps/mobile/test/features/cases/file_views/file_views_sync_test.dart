import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/file_views/application/file_views_providers.dart';
import 'package:lawbid/features/cases/file_views/data/file_views_repository.dart';
import 'package:lawbid/features/cases/file_views/domain/file_view.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';

/// Owner 2026-10-24: «Просмотры» is kept on the phone like the chat
/// history; only rows newer than the newest held are asked, in small pages.
class _FakeRemote implements FileViewsRemote {
  _FakeRemote(this.rows, {this.pageSize = 2});

  /// Newest first.
  List<FileView> rows;
  final int pageSize;
  final calls = <({String? cursor, DateTime? since})>[];
  bool offline = false;

  @override
  Future<FileViewsPage> page(
    String fileId, {
    String? cursor,
    DateTime? since,
  }) async {
    calls.add((cursor: cursor, since: since));
    if (offline) {
      throw const ApiException(
        code: ApiException.networkErrorCode,
        message: 'offline',
      );
    }
    final all = [
      for (final r in rows)
        if (since == null || r.viewedAt.isAfter(since)) r,
    ];
    final start = cursor == null ? 0 : int.parse(cursor);
    final page = all.skip(start).take(pageSize).toList();
    final end = start + page.length;
    return FileViewsPage(
      items: page,
      nextCursor: end < all.length ? '$end' : null,
    );
  }
}

FileView _v(int minute) => FileView(
      id: 'v${minute.toString().padLeft(3, '0')}',
      viewerUserId: 'u2',
      viewerName: 'Ann Lee',
      viewerRole: 'attorney',
      viewedAt: DateTime.utc(2026, 10, 24, 8, minute),
      device: 'iPhone 15',
      platform: 'ios',
      ipMasked: '203.0.113.x',
    );

void main() {
  late CacheDatabase db;
  late _FakeRemote remote;
  late StreamController<RealtimeEvent> events;

  setUp(() {
    db = CacheDatabase(NativeDatabase.memory());
    events = StreamController<RealtimeEvent>.broadcast();
    // Newest first: minutes 5, 4, 3, 2, 1.
    remote = _FakeRemote([for (var m = 5; m >= 1; m--) _v(m)]);
  });

  tearDown(() async {
    await events.close();
    await db.close();
  });

  ProviderContainer open() {
    final c = ProviderContainer(
      overrides: [
        fileViewsRemoteProvider.overrideWithValue(remote),
        fileViewsStoreProvider.overrideWithValue(FileViewsStore(db, 'me')),
        realtimeEventsProvider.overrideWithValue(events.stream),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  Future<void> settle() async {
    for (var i = 0; i < 10; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  test('first open reads one small page and keeps it on the device', () async {
    final c = open();
    final list = await c.read(fileViewsProvider('f1').future);
    expect(list.items.map((v) => v.id), ['v005', 'v004']);
    expect(list.hasMore, isTrue);
    expect(remote.calls, hasLength(1));
    expect(remote.calls.single.since, isNull);
    final held = await FileViewsStore(db, 'me').read('f1');
    expect(held!.rows, hasLength(2));
    expect(held.newestAt!.toUtc(), DateTime.utc(2026, 10, 24, 8, 5));
    expect(held.olderCursor, '2');
  });

  test(
      'reopened: the saved list is shown at once and only newer rows are asked',
      () async {
    await open().read(fileViewsProvider('f1').future);
    remote.calls.clear();
    // Two more people open the file meanwhile.
    remote.rows = [_v(7), _v(6), ...remote.rows];

    final c = open();
    final first = await c.read(fileViewsProvider('f1').future);
    // Instantly: the copy (v005, v004), no first-page read.
    expect(first.items.map((v) => v.id), ['v005', 'v004']);
    await settle();
    // One request, `since` = the newest held, never a full re-read.
    expect(remote.calls, hasLength(1));
    expect(
      remote.calls.single.since!.toUtc(),
      DateTime.utc(2026, 10, 24, 8, 5),
    );
    expect(remote.calls.single.cursor, isNull);
    final now = c.read(fileViewsProvider('f1')).value!;
    expect(now.items.map((v) => v.id), ['v007', 'v006', 'v005', 'v004']);
    // The older cursor is still the saved one.
    expect(now.nextCursor, '2');
    final held = await FileViewsStore(db, 'me').read('f1');
    expect(held!.newestAt!.toUtc(), DateTime.utc(2026, 10, 24, 8, 7));
  });

  test('a delta bigger than a page is read page by page and saved once',
      () async {
    await open().read(fileViewsProvider('f1').future);
    remote
      ..calls.clear()
      ..rows = [for (var m = 12; m >= 6; m--) _v(m), ...remote.rows];
    final c = open();
    await c.read(fileViewsProvider('f1').future);
    await settle();
    // 7 new rows / 2 per page = 4 requests, all with the same `since`.
    expect(remote.calls, hasLength(4));
    expect(
      remote.calls.map((c) => c.since!.toUtc()).toSet(),
      {DateTime.utc(2026, 10, 24, 8, 5)},
    );
    final now = c.read(fileViewsProvider('f1')).value!;
    expect(now.items.first.id, 'v012');
    expect(now.items, hasLength(9));
  });

  test('offline: the saved list stays, nothing breaks', () async {
    await open().read(fileViewsProvider('f1').future);
    remote
      ..calls.clear()
      ..offline = true;
    final c = open();
    final list = await c.read(fileViewsProvider('f1').future);
    await settle();
    expect(list.items, isNotEmpty);
    expect(c.read(fileViewsProvider('f1')).hasError, isFalse);
    expect(c.read(fileViewsProvider('f1')).value!.items, hasLength(2));
  });

  test('scrolling down reads the older page by cursor and keeps it', () async {
    final c = open();
    await c.read(fileViewsProvider('f1').future);
    await c.read(fileViewsProvider('f1').notifier).loadMore();
    final list = c.read(fileViewsProvider('f1')).value!;
    expect(list.items.map((v) => v.id), ['v005', 'v004', 'v003', 'v002']);
    expect(remote.calls.last.cursor, '2');
    final held = await FileViewsStore(db, 'me').read('f1');
    expect(held!.rows, hasLength(4));
    expect(held.olderCursor, '4');
  });

  test('a file:viewed event for this file is one ?since= request', () async {
    final c = open();
    await c.read(fileViewsProvider('f1').future);
    remote.calls.clear();
    remote.rows = [_v(9), ...remote.rows];
    events.add(
      const RealtimeEvent('file:viewed', {
        'fileIds': ['f1'],
      }),
    );
    await Future<void>.delayed(
      FileViewsNotifier.eventDelay + const Duration(milliseconds: 100),
    );
    expect(remote.calls, hasLength(1));
    expect(
      remote.calls.single.since!.toUtc(),
      DateTime.utc(2026, 10, 24, 8, 5),
    );
    expect(c.read(fileViewsProvider('f1')).value!.items.first.id, 'v009');
  });

  test('an event about another file asks nothing', () async {
    final c = open();
    await c.read(fileViewsProvider('f1').future);
    remote.calls.clear();
    events.add(
      const RealtimeEvent('file:viewed', {
        'fileIds': ['other'],
      }),
    );
    await Future<void>.delayed(
      FileViewsNotifier.eventDelay + const Duration(milliseconds: 100),
    );
    expect(remote.calls, isEmpty);
  });

  test('another account never sees the copy', () async {
    await open().read(fileViewsProvider('f1').future);
    expect(await FileViewsStore(db, 'someone-else').read('f1'), isNull);
  });

  test('the per-file cap stops saving older pages (they stay in memory)',
      () async {
    remote = _FakeRemote(
      [for (var m = 130; m >= 1; m--) _v(m)],
      pageSize: 50,
    );
    final c = open();
    await c.read(fileViewsProvider('f1').future);
    final n = c.read(fileViewsProvider('f1').notifier);
    await n.loadMore(); // 100 rows saved
    await n.loadMore(); // would be 150: shown, not saved
    expect(c.read(fileViewsProvider('f1')).value!.items, hasLength(130));
    expect(
      await FileViewsStore(db, 'me').count('f1'),
      lessThanOrEqualTo(FileViewsStore.maxPerFile),
    );
  });

  test('LRU by file: the file opened longest ago goes first', () async {
    final store = FileViewsStore(db, 'me');
    await store.save('old', [_v(1)], newest: _v(1).viewedAt);
    await Future<void>.delayed(const Duration(milliseconds: 5));
    await store.save('new', [_v(2)], newest: _v(2).viewedAt);
    final bytes = await db.fileViewsBytes();
    await db.trimFileViews(bytes - 1);
    expect(await store.read('old'), isNull);
    expect(await store.read('new'), isNotNull);
    await db.clearOther();
    expect(await db.fileViewsBytes(), 0);
  });
}
