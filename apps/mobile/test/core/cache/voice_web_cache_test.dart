import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/voice_web_cache.dart';
import 'package:lawbid/core/cache/web_blob_store.dart';

/// SPEED_MATRIX 2026-11-09 §2.3 (site): a voice note is downloaded once
/// and kept in the browser's Cache Storage, like on the phone
/// (`voice_cache_<id>.m4a`) — the second play never touches the network.
void main() {
  final note = Uint8List.fromList(List.generate(64, (i) => i));

  test('the second play comes from the browser cache, not the network',
      () async {
    final store = MemoryBlobStore();
    final cache = VoiceWebCache(store: store);
    var downloads = 0;
    Future<Uint8List?> fetch() async {
      downloads++;
      return note;
    }

    expect(await cache.bytes('m-1', fetch), note);
    expect(await cache.bytes('m-1', fetch), note);
    expect(downloads, 1);
    expect(
      (await store.list(VoiceWebCache.cacheName)).single.key,
      'm-1',
    );
  });

  test('a failed download keeps nothing and is tried again', () async {
    final cache = VoiceWebCache(store: MemoryBlobStore());
    var calls = 0;
    Future<Uint8List?> fetch() async {
      calls++;
      return calls == 1 ? null : note;
    }

    expect(await cache.bytes('m-2', fetch), isNull);
    expect(await cache.bytes('m-2', fetch), note);
    expect(calls, 2);
  });

  test('old notes are swept on the first write; clear empties the cache',
      () async {
    final store = MemoryBlobStore();
    var now = DateTime(2026, 11, 9);
    store.now = () => now;
    final cache = VoiceWebCache(store: store);
    await cache.bytes('old', () async => note);
    now = now.add(const Duration(days: 31));
    final fresh = VoiceWebCache(store: store)..now = () => now;
    await fresh.bytes('new', () async => note);
    expect(
      (await store.list(VoiceWebCache.cacheName)).map((b) => b.key),
      ['new'],
    );
    await fresh.clear();
    expect(await store.list(VoiceWebCache.cacheName), isEmpty);
  });
}
