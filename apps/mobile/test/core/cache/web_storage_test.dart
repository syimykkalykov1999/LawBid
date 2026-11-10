import 'dart:io';
import 'dart:typed_data';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/cache_maintenance.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/cache/web_blob_store.dart';
import 'package:lawbid/core/cache/web_storage.dart';
import 'package:lawbid/core/media/video_cache/video_cache.dart';
import 'package:lawbid/core/uploads/upload_files_web.dart';

class _Info implements WebStorageInfo {
  _Info(this.store);

  final MemoryBlobStore store;
  final names = <String>{};
  ({int usage, int quota})? answer;

  @override
  Future<List<String>> cacheNames() async => names.toList();

  @override
  Future<({int usage, int quota})?> estimate() async => answer;
}

/// B-c2 (e), 2026-11-09: «Данные и память» on the site measures and empties
/// the site's own Cache Storage, and frees it near the browser's quota.
void main() {
  late MemoryBlobStore store;
  late _Info info;
  late WebCaches web;
  late CacheDatabase db;
  late Directory root;

  Future<void> put(String cache, String key, int bytes) async {
    info.names.add(cache);
    await store.put(cache, key, Uint8List(bytes));
  }

  setUp(() async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    store = MemoryBlobStore();
    info = _Info(store);
    web = WebCaches(info: info, store: store);
    db = CacheDatabase(NativeDatabase.memory());
    root = await Directory.systemTemp.createTemp('web_storage_test');
  });
  tearDown(() async {
    VideoCache.debugReset();
    await db.close();
    if (root.existsSync()) await root.delete(recursive: true);
  });

  CacheMaintenance maintenance({WebCaches? caches}) => CacheMaintenance(
        db: db,
        pages: null,
        limits: () => const CacheLimits(),
        images: MediaCacheDir('images', root: () async => root),
        chatMedia: MediaCacheDir('chat', root: () async => root),
        video: MediaCacheDir('video', root: () async => root),
        caseFiles: MediaCacheDir('files', root: () async => root),
        voiceNotes: PrefixedTempFiles(
          'voice_cache_',
          suffix: '.m4a',
          root: () async => root,
        ),
        web: caches,
      );

  test('the upload queue is never a cleanable cache', () {
    expect(WebCaches.kept, contains(WebUploadFiles.cacheName));
  });

  test('the site caches land on their rows; others and the queue do not',
      () async {
    await put('lawbid_voice', 'a', 300);
    await put('lawbid_video_heads', 'b', 200);
    await put('lawbid_upload_queue', 'c', 999);
    await put('flutter-app-cache', 'd', 777);
    final before = await maintenance().measure();
    expect(before.of(CacheStore.chatMedia), 0); // the old web screen
    final report = await maintenance(caches: web).measure();
    expect(report.of(CacheStore.chatMedia), 300);
    expect(report.of(CacheStore.video), 200);
    expect(report.total, 500);
  });

  test('«Очистить» on a row empties its site caches only', () async {
    await put('lawbid_voice', 'a', 300);
    await put('lawbid_video_heads', 'b', 200);
    await put('lawbid_upload_queue', 'c', 999);
    final m = maintenance(caches: web);
    expect(await m.clear(CacheStore.chatMedia), isTrue);
    expect(await store.list('lawbid_voice'), isEmpty);
    expect(await store.list('lawbid_video_heads'), hasLength(1));
    await m.clearAll();
    expect(await store.list('lawbid_video_heads'), isEmpty);
    expect(await store.list('lawbid_upload_queue'), hasLength(1));
  });

  test('near the browser quota the site caches go, below it they stay',
      () async {
    await put('lawbid_voice', 'a', 300);
    info.answer = (usage: 50, quota: 100);
    expect(await web.relieve(), isFalse);
    expect(await store.list('lawbid_voice'), hasLength(1));
    info.answer = (usage: 85, quota: 100);
    expect(await web.relieve(), isTrue);
    expect(await store.list('lawbid_voice'), isEmpty);
    info.answer = null; // the browser does not say
    expect(await web.relieve(), isFalse);
  });
}
