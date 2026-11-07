import 'dart:typed_data';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/core/cache/web_blob_store.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:lawbid/core/uploads/upload_files_memory.dart';

UploadFiles createUploadFiles() => WebUploadFiles();

/// Owner 2026-11-03 (web gaps, R-050/R-251): the browser upload queue
/// survives a reload. The bytes stay in this tab's memory for speed and are
/// also written to the browser Cache Storage ([cacheName]); after a reload
/// (or a closed tab) `read` finds them there, so the queue row — which
/// drift already keeps in the browser database — resumes instead of showing
/// «not sent». A file over [maxPersistBytes] stays in memory only (the
/// browser quota is shared with the site); entries older than [maxAge] are
/// swept on the first write.
class WebUploadFiles extends MemoryUploadFiles {
  WebUploadFiles({
    WebBlobStore? store,
    this.maxPersistBytes = 200 * 1024 * 1024,
    this.maxAge = const Duration(days: 7),
  }) : _store = store ?? WebBlobStore();

  /// The Cache Storage cache of the queue. Not one of the cleanable media
  /// caches: «Очистить кэш» never drops a post that is waiting to be sent.
  static const cacheName = 'lawbid_upload_queue';

  final WebBlobStore _store;
  final int maxPersistBytes;
  final Duration maxAge;
  bool _swept = false;

  @override
  Future<String> keep(
    String name, {
    Uint8List? bytes,
    String? fromPath,
    bool move = false,
  }) async {
    await _sweepOnce();
    final kept = await super.keep(
      name,
      bytes: bytes,
      fromPath: fromPath,
      move: move,
    );
    final data = await super.read(kept);
    if (data != null && data.length <= maxPersistBytes) {
      try {
        await _store.put(cacheName, kept, data);
      } on Object catch (e) {
        debugPrint('upload queue persist $kept: $e');
      }
    }
    return kept;
  }

  @override
  Future<Uint8List?> read(String name) async =>
      await super.read(name) ?? await _store.get(cacheName, name);

  @override
  Future<void> remove(String name) async {
    await super.remove(name);
    await _store.delete(cacheName, name);
  }

  Future<void> _sweepOnce() async {
    if (_swept) return;
    _swept = true;
    try {
      final cutoff = DateTime.now().subtract(maxAge);
      for (final b in await _store.list(cacheName)) {
        if (b.written.isBefore(cutoff)) await _store.delete(cacheName, b.key);
      }
    } on Object {
      // Best effort.
    }
  }

  @override
  Future<void> forgetOnSignOut() async {
    try {
      await _store.clear(cacheName);
    } on Object catch (e) {
      debugPrint('upload queue forget: $e');
    }
  }
}
