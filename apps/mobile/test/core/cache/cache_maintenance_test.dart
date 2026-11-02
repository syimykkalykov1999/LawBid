import 'dart:async';
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
      f.setLastModifiedSync(DateTime.now().subtract(age));
    }
    return f;
  }

  CacheMaintenance maintenance(
    Map<CacheStore, int> userMb, {
    CacheLimits Function()? limits,
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
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: -1);
    await maintenance({CacheStore.video: 1}).enforce();
    expect(
      await port.first.timeout(const Duration(seconds: 5)),
      ('max', _mib),
    );
  });

  test('a limit set with no proxy is sent once one is attached and enforced', () async {
    await maintenance({CacheStore.video: 1}).enforce();
    final port = ReceivePort();
    addTearDown(port.close);
    // The proxy came up with the old limit (as if started meanwhile).
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: 100 * _mib);
    await maintenance({CacheStore.video: 1}).enforce();
    expect(
      await port.first.timeout(const Duration(seconds: 5)),
      ('max', _mib),
    );
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
}
