import 'dart:async';
import 'dart:io';
import 'dart:isolate';

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
///
/// Owner 2026-10-28 (the hard freeze, «намертво»): the loopback proxy runs
/// in its OWN background isolate, never on the root isolate. Since Flutter
/// 3.29 the root isolate runs on the iOS main thread, and AVPlayer's
/// plugin reads `AVAsset.duration` synchronously on that thread when a
/// video becomes ready (`-[FVPVideoPlayer reportInitialized]`). That call
/// waits for AVFoundation to fetch the HLS playlist — from this proxy. With
/// the proxy on the main thread nobody could answer: the main thread waited
/// on itself until the iOS watchdog killed the app (0x8BADF00D, crash
/// reports of 2026-10-28). In a background isolate the proxy answers while
/// the main thread waits.
abstract final class VideoCache {
  static SendPort? _commands;
  static int? _port;
  static String? _secret;
  static Future<void>? _starting;
  static bool _failed = false;
  static int _sentMaxBytes = -1;

  static bool get enabled =>
      !kIsWeb && ClientTuning.videoCacheMb > 0 && !_failed;

  /// The URL for the player. Sync on purpose (called from `initState`).
  static String resolve(String url) {
    if (!enabled || !url.startsWith('https://')) return url;
    final port = _port;
    final secret = _secret;
    if (port == null || secret == null) {
      unawaited(_ensureStarted());
      return url;
    }
    final max = ClientTuning.videoCacheMb * 1024 * 1024;
    if (max != _sentMaxBytes) {
      _sentMaxBytes = max;
      _commands?.send(('max', max));
    }
    final u = Uri.parse(url);
    return VideoCacheProxy.wrapUrl(
      port: port,
      secret: secret,
      upstream: u,
      isPlaylist: u.path.endsWith('.m3u8'),
    );
  }

  static Future<void> _ensureStarted() => _starting ??= () async {
        try {
          final base = await getTemporaryDirectory();
          final ready = ReceivePort();
          final maxBytes = ClientTuning.videoCacheMb * 1024 * 1024;
          await Isolate.spawn<_ProxyStart>(
            _proxyMain,
            _ProxyStart(
              reply: ready.sendPort,
              dir: '${base.path}/video_chunks',
              maxBytes: maxBytes,
              headBytes:
                  headBytesFor(seconds: ClientTuning.videoCacheChunkSeconds),
              hlsSeconds: ClientTuning.videoCacheChunkSeconds,
            ),
            debugName: 'video-cache-proxy',
            errorsAreFatal: false,
          );
          final msg = await ready.first.timeout(const Duration(seconds: 10));
          ready.close();
          if (msg is! (SendPort, int, String)) throw StateError('proxy');
          _sentMaxBytes = maxBytes;
          _commands = msg.$1;
          _secret = msg.$3;
          _port = msg.$2;
        } on Object {
          _failed = true;
        }
      }();

  /// «Очистить кэш»: drops every cached chunk.
  static Future<void> clear() async {
    final c = _commands;
    if (c == null) return;
    final done = ReceivePort();
    c.send(('clear', done.sendPort));
    try {
      await done.first.timeout(const Duration(seconds: 30));
    } on TimeoutException {
      // The chunks go on their own (LRU).
    } finally {
      done.close();
    }
  }
}

@immutable
class _ProxyStart {
  const _ProxyStart({
    required this.reply,
    required this.dir,
    required this.maxBytes,
    required this.headBytes,
    required this.hlsSeconds,
  });

  final SendPort reply;
  final String dir;
  final int maxBytes;
  final int headBytes;
  final int hlsSeconds;
}

/// The background isolate: the cache (disk scans included) and the
/// loopback server live here, off the main thread.
Future<void> _proxyMain(_ProxyStart s) async {
  final cache = ChunkCache(Directory(s.dir), maxBytes: s.maxBytes);
  final proxy = VideoCacheProxy(
    cache: cache,
    headBytes: s.headBytes,
    hlsSeconds: s.hlsSeconds,
  );
  await proxy.start();
  final commands = ReceivePort()
    ..listen((Object? m) async {
      if (m is (String, int) && m.$1 == 'max') {
        await cache.setMaxBytes(m.$2);
      } else if (m is (String, SendPort) && m.$1 == 'clear') {
        await cache.clear();
        m.$2.send(true);
      }
    });
  s.reply.send((commands.sendPort, proxy.port, proxy.secret));
}
