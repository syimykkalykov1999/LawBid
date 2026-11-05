import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/cache/web_blob_store.dart';
import 'package:lawbid/core/cache/web_cache_storage.dart';

Uint8List _b(int n) => Uint8List(n);

void main() {
  late MemoryBlobStore store;
  late WebCacheStorage web;
  var t = DateTime(2026, 11, 1);

  setUp(() {
    store = MemoryBlobStore()
      ..now = () {
        t = t.add(const Duration(hours: 1));
        return t;
      };
    web = WebCacheStorage(store: store);
  });

  test('sizeOf adds the blobs of one cache only', () async {
    await store.put('lawbid_images', 'a', _b(10));
    await store.put('lawbid_images', 'b', _b(5));
    await store.put('lawbid_video', 'c', _b(100));
    expect(await web.sizeOf('lawbid_images'), 15);
    expect(await web.sizeOf('lawbid_video'), 100);
    expect(await web.sizeOf('nothing'), 0);
  });

  test('trimTo drops the oldest first until it fits', () async {
    await store.put('c', 'old', _b(40));
    await store.put('c', 'mid', _b(40));
    await store.put('c', 'new', _b(40));
    expect(await web.trimTo('c', 80), 40);
    expect((await store.list('c')).map((e) => e.key), ['mid', 'new']);
    expect(await web.trimTo('c', 1000), 0);
  });

  test('dropOlderThan keeps the fresh blobs', () async {
    final base = DateTime.now();
    store.now = () => base.subtract(const Duration(days: 10));
    await store.put('c', 'stale', _b(7));
    store.now = () => base;
    await store.put('c', 'fresh', _b(3));
    expect(await web.dropOlderThan('c', const Duration(days: 3)), 7);
    expect((await store.list('c')).single.key, 'fresh');
  });

  test('clear empties one cache and reports it', () async {
    await store.put('a', 'x', _b(1));
    await store.put('b', 'y', _b(1));
    expect(await web.clear('a'), isTrue);
    expect(await store.list('a'), isEmpty);
    expect(await store.list('b'), hasLength(1));
  });

  test('estimate comes from the store', () async {
    await store.put('a', 'x', _b(9));
    expect((await web.estimate())!.usage, 9);
  });

  group('MediaCacheDir in a browser', () {
    MediaCacheDir dir() =>
        MediaCacheDir('lawbid_chat_media', web: web, onWeb: true);

    test('size, trim, sweep and clear go to the browser store', () async {
      await store.put('lawbid_chat_media', 'a', _b(30));
      await store.put('lawbid_chat_media', 'b', _b(30));
      expect(await dir().size(), 60);
      expect(await dir().trimTo(30), 30);
      expect(await dir().size(), 30);
      await dir().clearContents();
      expect(await dir().size(), 0);
      await store.put('lawbid_chat_media', 'c', _b(5));
      await dir().clear();
      expect(await dir().size(), 0);
    });

    test('does not touch another cache', () async {
      await store.put('lawbid_upload_queue', 'job', _b(50));
      await dir().clear();
      expect(await store.list('lawbid_upload_queue'), hasLength(1));
    });
  });
}
