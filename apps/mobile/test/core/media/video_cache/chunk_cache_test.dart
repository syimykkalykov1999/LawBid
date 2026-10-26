import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/video_cache/chunk_cache.dart';

void main() {
  late Directory dir;
  setUp(() => dir = Directory.systemTemp.createTempSync('chunk_cache_'));
  tearDown(() => dir.deleteSync(recursive: true));

  List<int> b(int n) => List.filled(n, 1);

  test('stores and returns a chunk', () async {
    final c = ChunkCache(dir, maxBytes: 100);
    await c.put('a', b(10));
    expect((await c.get('a'))!.length, 10);
    expect(await c.get('missing'), isNull);
    expect(c.totalBytes, 10);
  });

  test('evicts the least recently used past the ceiling', () async {
    final c = ChunkCache(dir, maxBytes: 30);
    await c.put('a', b(10));
    await c.put('b', b(10));
    await c.put('c', b(10));
    await c.get('a'); // a is fresh now, b is the oldest
    await c.put('d', b(10));
    expect(c.contains('b'), isFalse);
    expect(c.contains('a'), isTrue);
    expect(c.totalBytes, 30);
    expect(File('${dir.path}/b').existsSync(), isFalse);
  });

  test('a chunk bigger than the ceiling is not stored', () async {
    final c = ChunkCache(dir, maxBytes: 5);
    await c.put('big', b(10));
    expect(c.count, 0);
  });

  test(
    'lowering the ceiling shrinks at once; replacing keeps the sum',
    () async {
      final c = ChunkCache(dir, maxBytes: 100);
      await c.put('a', b(40));
      await c.put('a', b(20));
      expect(c.totalBytes, 20);
      await c.put('b', b(40));
      await c.setMaxBytes(50);
      expect(c.contains('a'), isFalse);
      expect(c.totalBytes, 40);
    },
  );

  test('index is rebuilt from disk after a restart', () async {
    final c = ChunkCache(dir, maxBytes: 100);
    await c.put('a', b(10));
    final again = ChunkCache(dir, maxBytes: 100);
    expect((await again.get('a'))!.length, 10);
    expect(again.totalBytes, 10);
    await again.clear();
    expect(again.count, 0);
  });
}
