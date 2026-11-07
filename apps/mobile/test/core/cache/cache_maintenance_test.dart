import 'dart:io';
import 'dart:isolate';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/cache_maintenance.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/media/video_cache/video_cache.dart';

const _mib = 1024 * 1024;

/// What a proxy starts with while the server's number is unknown.
const _ceiling = 1000 * _mib;

void main() {
  late Directory root;
  late CacheDatabase db;

  setUp(() async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    db = CacheDatabase(NativeDatabase.memory());
    root = await Directory.systemTemp.createTemp('cache_maintenance_test');
  });
  tearDown(() async {
    VideoCache.debugReset();
    await db.close();
    if (root.existsSync()) await root.delete(recursive: true);
  });

  File write(String rel, int bytes, {Duration age = Duration.zero}) {
    final f = File('${root.path}/$rel')
      ..createSync(recursive: true)
      ..writeAsBytesSync(List.filled(bytes, 1));
    if (age > Duration.zero) {
      // Last use is the later of write and read time: age both.
      final at = DateTime.now().subtract(age);
      f
        ..setLastModifiedSync(at)
        ..setLastAccessedSync(at);
    }
    return f;
  }

  CacheMaintenance maintenance(
    Map<CacheStore, int> userMb, {
    CacheLimits Function()? limits,
    Future<Set<String>> Function()? groupChatPaths,
  }) =>
      CacheMaintenance(
        db: db,
        pages: null,
        limits: limits ?? () => CacheLimits(userMb: userMb),
        images: MediaCacheDir('images', root: () async => root),
        chatMedia: MediaCacheDir('chat', root: () async => root),
        video: MediaCacheDir('video', root: () async => root),
        voiceNotes: PrefixedTempFiles(
          'voice_cache_',
          suffix: '.m4a',
          root: () async => root,
        ),
        groupChatPaths: groupChatPaths,
      );

  test('measure counts video and voice notes next to the pictures', () async {
    write('chat/a', 100);
    write('voice_cache_1.m4a', 50);
    write('video/c', 70);
    final r = await maintenance({}).measure();
    expect(r.of(CacheStore.chatMedia), 150);
    expect(r.of(CacheStore.video), 70);
  });

  test('enforce: pictures and voice notes are one pool', () async {
    final picture = write(
      'chat/a',
      (_mib * 0.6).round(),
      age: const Duration(hours: 1),
    );
    final note = write('voice_cache_1.m4a', (_mib * 0.6).round());
    await maintenance({CacheStore.chatMedia: 1}).enforce();
    expect(picture.existsSync(), isFalse);
    expect(note.existsSync(), isTrue);
    final left = await maintenance({}).measure();
    expect(left.of(CacheStore.chatMedia), lessThanOrEqualTo(_mib));
  });

  test('enforce: full pictures never wipe a fresh voice note', () async {
    write('chat/a', _mib, age: const Duration(hours: 2));
    final note = write('voice_cache_1.m4a', 100);
    await maintenance({CacheStore.chatMedia: 1}).enforce();
    expect(note.existsSync(), isTrue);
  });

  test('enforce: a note being downloaded (.part) is never swept', () async {
    final part = write('voice_cache_1.m4a.part', 2 * _mib);
    await maintenance({CacheStore.chatMedia: 1}).enforce();
    expect(part.existsSync(), isTrue);
  });

  test('enforce never deletes video files (the proxy owns them)', () async {
    final old = write(
      'video/a',
      (_mib * 0.6).round(),
      age: const Duration(hours: 2),
    );
    final fresh = write('video/b', (_mib * 0.6).round());
    await maintenance({CacheStore.video: 1}).enforce();
    expect(old.existsSync(), isTrue);
    expect(fresh.existsSync(), isTrue);
  });

  test('enforce hands the video limit to a running proxy', () async {
    final port = ReceivePort();
    addTearDown(port.close);
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: _ceiling);
    await maintenance({CacheStore.video: 1}).enforce();
    expect(
      await port.first.timeout(const Duration(seconds: 5)),
      ('max', _mib),
    );
  });

  test('a limit set during the start reaches the proxy', () async {
    VideoCache.limitTo(_mib);
    final port = ReceivePort();
    addTearDown(port.close);
    // The proxy came up with the ceiling (the server's number unknown).
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: _ceiling);
    expect(
      await port.first.timeout(const Duration(seconds: 5)),
      ('max', _mib),
    );
  });

  test('a zero limit never empties a running proxy', () async {
    final port = ReceivePort();
    addTearDown(port.close);
    final seen = <Object?>[];
    port.listen(seen.add);
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: _ceiling);
    VideoCache.limitTo(0);
    VideoCache.limitTo(-5);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(seen, isEmpty);
  });

  test('clear(video) asks a running proxy and answers its reply', () async {
    final port = ReceivePort();
    addTearDown(port.close);
    port.listen((Object? m) {
      if (m is (String, SendPort) && m.$1 == 'clear') m.$2.send(true);
    });
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: _mib);
    final f = write('video/a', 100);
    expect(await maintenance({}).clear(CacheStore.video), isTrue);
    expect(f.existsSync(), isTrue); // the proxy, not this code, deletes
  });

  test('clearAll empties every store', () async {
    write('chat/a', 100);
    write('video/a', 100);
    final m = maintenance({});
    expect(await m.clearAll(), isTrue);
    final r = await m.measure();
    expect(r.of(CacheStore.chatMedia), 0);
    expect(r.of(CacheStore.video), 0);
  });

  group('leaving the account', () {
    final sent = DateTime(2026, 11, 5);

    Future<void> seed(String owner) async {
      await db.putMessages(owner, 'chat-1', [
        (id: 'm-$owner', createdAt: sent, json: '{"body":"private"}'),
      ]);
      await db.setConversationSync(
        owner: owner,
        conversationId: 'chat-1',
        now: sent,
        newestId: 'm-$owner',
        complete: true,
      );
      await db.setSyncedAt(owner, 'inbox', sent);
    }

    test('photos, voice notes, half-loaded notes and video go', () async {
      final photo = write('chat/a', 100);
      final note = write('voice_cache_1.m4a', 50);
      final part = write('voice_cache_2.m4a.part', 50);
      final clip = write('video/a', 100);
      final picture = write('images/a', 100);

      expect(await maintenance({}).clearAccountData(), isTrue);

      for (final f in [photo, note, part, clip, picture]) {
        expect(f.existsSync(), isFalse, reason: f.path);
      }
    });

    test('the history goes together with its sync marks', () async {
      await seed('user-a');

      await maintenance({}).clearAccountData();

      expect(await db.messagesOf('user-a', 'chat-1'), isEmpty);
      // No mark left: the same person's next sign-in loads everything again.
      expect(await db.conversationSyncOf('user-a', 'chat-1'), isNull);
      expect(await db.syncedAt('user-a', 'inbox'), isNull);
    });

    test('the account signing in keeps its rows, the other one goes', () async {
      await seed('user-a');
      await seed('user-b');

      await maintenance({}).clearAccountData(keepOwner: 'user-b');

      expect(await db.messagesOf('user-a', 'chat-1'), isEmpty);
      expect(await db.conversationSyncOf('user-a', 'chat-1'), isNull);
      expect(await db.messagesOf('user-b', 'chat-1'), hasLength(1));
      expect(await db.conversationSyncOf('user-b', 'chat-1'), isNotNull);
    });

    test('the same person back: history can be stored again', () async {
      await seed('user-a');
      await maintenance({}).clearAccountData();

      await seed('user-a');

      expect(await db.messagesOf('user-a', 'chat-1'), hasLength(1));
    });
  });

  test('clear(video) empties the folder and answers true', () async {
    write('video/a', 100);
    final m = maintenance({});
    expect(await m.clear(CacheStore.video), isTrue);
    expect((await m.measure()).of(CacheStore.video), 0);
    expect(Directory('${root.path}/video').existsSync(), isTrue);
  });

  test('clear(chatMedia) removes pictures and notes, not .part', () async {
    write('chat/a', 100);
    write('voice_cache_1.m4a', 50);
    final part = write('voice_cache_2.m4a.part', 50);
    final m = maintenance({});
    expect(await m.clear(CacheStore.chatMedia), isTrue);
    expect((await m.measure()).of(CacheStore.chatMedia), 0);
    expect(part.existsSync(), isTrue);
  });

  test('a throwing limits() does not lock enforce for good', () async {
    var calls = 0;
    final m = maintenance(
      {},
      limits: () {
        calls++;
        if (calls == 1) throw StateError('limits');
        return const CacheLimits(userMb: {CacheStore.chatMedia: 1});
      },
    );
    await m.enforce(); // the failure is logged, not thrown
    write('chat/a', 2 * _mib);
    await m.enforce();
    expect((await m.measure()).of(CacheStore.chatMedia), 0);
  });

  const day = Duration(days: 1);
  CacheLimits Function() cap(
    int mb, {
    Map<AutoDeleteScope, int> days = const {},
  }) =>
      () => CacheLimits(userCapMb: mb, userAutoDeleteDays: days);

  test('video follows the user cap: 10 GB by default, the slider after',
      () async {
    final port = ReceivePort();
    addTearDown(port.close);
    final seen = <Object?>[];
    port.listen(seen.add);
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: _ceiling);
    await maintenance({}).enforce();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(seen.first, ('max', 10 * 1024 * _mib));
    await maintenance({}, limits: cap(30 * 1024)).enforce();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(seen, contains(('max', 30 * 1024 * _mib)));
  });

  test('video: an admin ceiling wins, «Нет» lifts every limit', () async {
    final port = ReceivePort();
    addTearDown(port.close);
    final seen = <Object?>[];
    port.listen(seen.add);
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: _ceiling);
    await maintenance(
      {},
      limits: () => const CacheLimits(ceilingMb: {CacheStore.video: 300}),
    ).enforce();
    await maintenance({}, limits: cap(0)).enforce();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(seen, contains(('max', 300 * _mib)));
    expect(seen, contains(('max', CacheLimits.unboundedBytes)));
  });

  test('cap: the least recently opened go first, across stores', () async {
    // 3 files of 0.5 MB, cap 1 MB: the one opened longest ago goes, wherever
    // it lives.
    final oldest = write('chat/a', _mib ~/ 2, age: day * 5);
    final middle = write('images/b', _mib ~/ 2, age: day * 2);
    final fresh = write('voice_cache_1.m4a', _mib ~/ 2);
    await maintenance({}, limits: cap(1)).enforce();
    expect(oldest.existsSync(), isFalse);
    expect(middle.existsSync(), isTrue);
    expect(fresh.existsSync(), isTrue);
  });

  test('cap: reading a file makes it recent (last access, not write)',
      () async {
    final read = write('chat/a', _mib ~/ 2, age: day * 5);
    final unread = write('images/b', _mib ~/ 2, age: day * 2);
    // Opened just now: written long ago, accessed today.
    read.setLastAccessedSync(DateTime.now());
    await maintenance({}, limits: cap(0)).enforce(); // 0 = no cap
    expect(read.existsSync() && unread.existsSync(), isTrue);
    final one = write('images/c', _mib ~/ 2, age: day * 3);
    await maintenance({}, limits: cap(1)).enforce();
    expect(one.existsSync(), isFalse, reason: 'older than the opened file');
    expect(read.existsSync(), isTrue);
  });

  test('cap «Нет» (0) and the 10 GB default never evict', () async {
    final f = write('chat/a', _mib, age: day * 400);
    await maintenance({}, limits: cap(0)).enforce();
    await maintenance({}).enforce(); // default 10 GB
    expect(f.existsSync(), isTrue);
  });

  test('cap: a running proxy is asked to trim to what is left', () async {
    final port = ReceivePort();
    addTearDown(port.close);
    final seen = <Object?>[];
    port.listen(seen.add);
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: _ceiling);
    write('video/a', (_mib * 0.7).round(), age: day * 9);
    write('chat/a', (_mib * 0.7).round());
    await maintenance({}, limits: cap(1)).enforce();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(seen, contains(('trim', 0)));
  });

  test('auto-delete: groups by age; personal and unknown never by it',
      () async {
    final personal = write('chat/personal', 100, age: day * 90);
    final unknown = write('chat/unknown', 100, age: day * 90);
    final group = write('chat/group', 100, age: day * 40);
    final groupNew = write('chat/group2', 100, age: day * 2);
    await maintenance(
      {},
      limits: () => const CacheLimits(),
      groupChatPaths: () async =>
          {canonicalPath(group.path), canonicalPath(groupNew.path)},
    ).enforce();
    expect(personal.existsSync(), isTrue, reason: 'personal = never');
    expect(unknown.existsSync(), isTrue, reason: 'not indexed = never');
    expect(group.existsSync(), isFalse, reason: 'groups = 1 month');
    expect(groupNew.existsSync(), isTrue);
  });

  test('auto-delete: without the group index nothing is aged by groups',
      () async {
    final f = write('chat/a', 100, age: day * 90);
    await maintenance({}, limits: () => const CacheLimits()).enforce();
    expect(f.existsSync(), isTrue);
  });

  test('auto-delete: personal chats and voice notes follow their own age',
      () async {
    final personal = write('chat/personal', 100, age: day * 5);
    final note = write('voice_cache_1.m4a', 100, age: day * 5);
    final group = write('chat/group', 100, age: day * 5);
    await maintenance(
      {},
      limits: () => const CacheLimits(
        userAutoDeleteDays: {AutoDeleteScope.privateChats: 3},
      ),
      groupChatPaths: () async => {canonicalPath(group.path)},
    ).enforce();
    expect(personal.existsSync(), isFalse);
    expect(note.existsSync(), isFalse);
    expect(group.existsSync(), isTrue, reason: 'groups: 30 days');
  });

  test('auto-delete: feed pictures after a week, video via the proxy',
      () async {
    final port = ReceivePort();
    addTearDown(port.close);
    final seen = <Object?>[];
    port.listen(seen.add);
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: _ceiling);
    final old = write('images/a', 100, age: day * 8);
    final fresh = write('images/b', 100, age: day * 2);
    await maintenance({}).enforce();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(old.existsSync(), isFalse);
    expect(fresh.existsSync(), isTrue);
    expect(seen, contains(('age', 7 * 24 * 3600)));
  });

  test('categories: ring slices add up and clear selectively', () async {
    await db.putMessages(
      'me',
      'c1',
      [(id: 'm1', createdAt: DateTime(2026), json: 'y' * 1000)],
    );
    write('images/a', 300);
    write('chat/a', 200);
    write('video/a', 100);
    final m = maintenance({});
    final r = await m.measure();
    expect(r.ofCategory(StorageCategory.photos), 500);
    expect(r.ofCategory(StorageCategory.video), 100);
    expect(
      StorageCategory.values.fold<int>(0, (a, c) => a + r.ofCategory(c)),
      r.total,
    );
    expect(await m.clearCategories({StorageCategory.photos}), isTrue);
    final after = await m.measure();
    expect(after.ofCategory(StorageCategory.photos), 0);
    expect(after.ofCategory(StorageCategory.video), 100);
    expect(after.ofCategory(StorageCategory.other), greaterThan(0));
  });
}
