import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/media/video_cache/chunk_cache.dart';
import 'package:lawbid/core/media/video_cache/range_plan.dart';
import 'package:lawbid/core/media/video_cache/video_cache_proxy.dart';
import 'package:path_provider/path_provider.dart';

/// N-1: the app-wide switch of the video chunk cache. Players ask
/// [resolve] for the URL to open: while the cache is off, still starting,
/// unavailable (web, a plain-http link) it returns the same URL, so a
/// failure here can only ever mean «no cache», never «no video».
/// Size and head length come from the server (`client.video_cache_mb`,
/// `client.video_cache_chunk_s`; 0 MB = off).
abstract final class VideoCache {
  static VideoCacheProxy? _proxy;
  static ChunkCache? _cache;
  static Future<void>? _starting;
  static bool _failed = false;

  static bool get enabled =>
      !kIsWeb && ClientTuning.videoCacheMb > 0 && !_failed;

  /// The URL for the player. Sync on purpose (called from `initState`).
  static String resolve(String url) {
    if (!enabled || !url.startsWith('https://')) return url;
    final p = _proxy;
    if (p == null || !p.running) {
      unawaited(_ensureStarted());
      return url;
    }
    _cache?.maxBytes = ClientTuning.videoCacheMb * 1024 * 1024;
    final u = Uri.parse(url);
    return p.wrap(u, isPlaylist: u.path.endsWith('.m3u8'));
  }

  static Future<void> _ensureStarted() => _starting ??= () async {
        try {
          final base = await getTemporaryDirectory();
          final cache = ChunkCache(
            Directory('${base.path}/video_chunks'),
            maxBytes: ClientTuning.videoCacheMb * 1024 * 1024,
          );
          final proxy = VideoCacheProxy(
            cache: cache,
            headBytes:
                headBytesFor(seconds: ClientTuning.videoCacheChunkSeconds),
            hlsSeconds: ClientTuning.videoCacheChunkSeconds,
          );
          await proxy.start();
          _cache = cache;
          _proxy = proxy;
        } on Object {
          _failed = true;
        }
      }();

  /// «Очистить кэш»: drops every cached chunk.
  static Future<void> clear() async => _cache?.clear();
}
