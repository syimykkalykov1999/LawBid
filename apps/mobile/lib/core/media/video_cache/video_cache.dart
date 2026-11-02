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
  /// The chunks' folder under the temporary directory.
  static const folderName = 'video_chunks';

  static SendPort? _commands;
  static int? _port;
  static String? _secret;
  static Future<void>? _starting;
  static bool _failed = false;
  static int _sentMaxBytes = -1;

  /// The «Данные и память» limit for «Видео» (null = none handed over yet).
  static int? _storeLimitBytes;

  /// The proxy's byte limit: the administrator's tuning, lowered (never
  /// raised) by the store limit (itself the admin ceiling or the user's
  /// lower choice).
  static int get maxBytes {
    final tuned = ClientTuning.videoCacheMb * 1024 * 1024;
    final store = _storeLimitBytes;
    return store == null || store >= tuned ? tuned : store;
  }

  /// Hands the store limit to the proxy, which evicts to it itself: at
  /// once when it runs, right after it is up when it is still starting.
  static void limitTo(int bytes) {
    _storeLimitBytes = bytes;
    _syncMax();
  }

  static void _syncMax() {
    final commands = _commands;
    if (commands == null || maxBytes == _sentMaxBytes) return;
    _sentMaxBytes = maxBytes;
    commands.send(('max', maxBytes));
  }

  /// Completes once a proxy that is starting is up (or failed to start).
  static Future<void> settled() async => await _starting;

  /// Test hook: forget the proxy and the limit.
  @visibleForTesting
  static void debugReset() {
    _commands = null;
    _port = null;
    _secret = null;
    _starting = null;
    _failed = false;
    _sentMaxBytes = -1;
    _storeLimitBytes = null;
  }

  /// Test hook: pretend a proxy is up, started with [sentMaxBytes].
  @visibleForTesting
  static void debugAttach(SendPort commands, {required int sentMaxBytes}) {
    _sentMaxBytes = sentMaxBytes;
    _commands = commands;
  }

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
    _syncMax();
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
          final startMax = maxBytes;
          final isolate = await Isolate.spawn<_ProxyStart>(
            _proxyMain,
            _ProxyStart(
              reply: ready.sendPort,
              dir: '${base.path}/$folderName',
              maxBytes: startMax,
              headBytes:
                  headBytesFor(seconds: ClientTuning.videoCacheChunkSeconds),
              hlsSeconds: ClientTuning.videoCacheChunkSeconds,
            ),
            debugName: 'video-cache-proxy',
            errorsAreFatal: false,
          );
          final Object? msg;
          try {
            msg = await ready.first.timeout(const Duration(seconds: 10));
          } on Object {
            // No answer: do not leave a proxy running that nobody uses.
            isolate.kill(priority: Isolate.immediate);
            rethrow;
          } finally {
            ready.close();
          }
          if (msg is! (SendPort, int, String)) {
            isolate.kill(priority: Isolate.immediate);
            throw StateError('proxy');
          }
          _sentMaxBytes = startMax;
          _commands = msg.$1;
          _secret = msg.$3;
          _port = msg.$2;
          // A limit handed over while the proxy was starting.
          _syncMax();
        } on Object {
          _failed = true;
        }
      }();

  /// Whether the proxy isolate is up (it then owns the folder).
  static bool get running => _commands != null;

  /// «Очистить кэш»: drops every cached chunk. False when the proxy did not
  /// answer in time (the chunks are then still on disk).
  static Future<bool> clear() async {
    final c = _commands;
    if (c == null) return true;
    final done = ReceivePort();
    c.send(('clear', done.sendPort));
    try {
      await done.first.timeout(const Duration(seconds: 30));
      return true;
    } on TimeoutException {
      return false;
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
