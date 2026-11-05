import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/web_blob_store.dart';
import 'package:lawbid/core/uploads/upload_files_web.dart';

void main() {
  Uint8List bytes(int n) => Uint8List.fromList(List.filled(n, 7));

  test('a kept file is found again after a reload (new instance)', () async {
    final store = MemoryBlobStore();
    final before = WebUploadFiles(store: store);
    await before.keep('job.mp4', bytes: bytes(12));
    // A reload: memory is gone, the browser store stays.
    final after = WebUploadFiles(store: store);
    expect((await after.read('job.mp4'))!.length, 12);
  });

  test('remove forgets it everywhere', () async {
    final store = MemoryBlobStore();
    final f = WebUploadFiles(store: store);
    await f.keep('job.mp4', bytes: bytes(3));
    await f.remove('job.mp4');
    expect(await WebUploadFiles(store: store).read('job.mp4'), isNull);
    expect(await store.list(WebUploadFiles.cacheName), isEmpty);
  });

  test('a file over the limit stays in memory only', () async {
    final store = MemoryBlobStore();
    final f = WebUploadFiles(store: store, maxPersistBytes: 10);
    await f.keep('big.mp4', bytes: bytes(11));
    expect(await f.read('big.mp4'), isNotNull);
    expect(await store.list(WebUploadFiles.cacheName), isEmpty);
  });

  test('old leftovers are swept on the first write', () async {
    final store = MemoryBlobStore()
      ..now = () => DateTime.now().subtract(const Duration(days: 30));
    await store.put(WebUploadFiles.cacheName, 'ghost', bytes(4));
    store.now = DateTime.now;
    final f = WebUploadFiles(store: store);
    await f.keep('new.mp4', bytes: bytes(2));
    final keys = (await store.list(WebUploadFiles.cacheName)).map((e) => e.key);
    expect(keys, ['new.mp4']);
  });

  test('a store that fails does not break the upload', () async {
    final f = WebUploadFiles(store: _Broken());
    await f.keep('job.mp4', bytes: bytes(2));
    expect((await f.read('job.mp4'))!.length, 2);
  });
}

class _Broken extends MemoryBlobStore {
  @override
  Future<void> put(String cache, String key, Uint8List bytes) =>
      throw StateError('quota');
}
