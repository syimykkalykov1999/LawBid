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
  static DateTime? _failedAt;
  static int _sentMaxBytes = -1;

  /// After a failed start the cache stays off this long, then the next
  /// video tries again (a slow first start must not cost the whole session).
  static const _retryAfter = Duration(minutes: 1);

  /// The upper bound `client.video_cache_mb` can take: the limit a proxy
  /// starts with while the server's own number is not known yet.
  static const _ceilingMb = 1000;

  /// The «Данные и память» limit for «Видео» (null = none handed over yet).
  static int? _storeLimitBytes;

  /// The proxy's byte limit: the administrator's tuning, lowered (never
  /// raised) by the store limit (itself the admin ceiling or the user's
  /// lower choice). Before the first bootstrap answer the tuning is not
  /// known: the proxy then starts with the ceiling, so its start-up
  /// eviction cannot drop chunks that the server's number would keep.
  static int get maxBytes {
    final tunedMb =
        ClientTuning.applied ? ClientTuning.videoCacheMb : _ceilingMb;
    final tuned = tunedMb * 1024 * 1024;
    final store = _storeLimitBytes;
    return store == null || store >= tuned ? tuned : store;
  }

  /// Hands the store limit to the proxy, which evicts to it itself: at
  /// once when it runs, right after it is up when it is still starting.
  /// A zero or negative limit is ignored (it would empty the cache).
  static void limitTo(int bytes) {
    if (bytes <= 0) return;
    _storeLimitBytes = bytes;
    _syncMax();
  }

  /// Owner 2026-11-03: drops the oldest chunks until [bytes] remain (the
  /// global cache cap). False when no proxy runs (its folder is then
  /// untouched by this call).
  static bool trimTo(int bytes) {
    final c = _commands;
    if (c == null) return false;
    c.send(('trim', bytes < 0 ? 0 : bytes));
    return true;
  }

  /// Owner 2026-11-03: drops the feed videos' chunks not played for [age]
  /// («Автоудаление» of the feed; chat videos stay). False when no proxy
  /// runs.
  static bool dropOlderThan(Duration age) {
    final c = _commands;
    if (c == null) return false;
    c.send(('age', age.inSeconds));
    return true;
  }

  static void _syncMax() {
    final commands = _commands;
    final max = maxBytes;
    if (commands == null || max <= 0 || max == _sentMaxBytes) return;
    _sentMaxBytes = max;
    commands.send(('max', max));
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
    _failedAt = null;
    _sentMaxBytes = -1;
    _storeLimitBytes = null;
  }

  /// Test hook: a proxy that came up with [sentMaxBytes] (the same step as
  /// the end of a real start).
  @visibleForTesting
  static void debugAttach(SendPort commands, {required int sentMaxBytes}) =>
      _attach(commands, 1, 'test', sentMaxBytes);

  static void _attach(SendPort commands, int port, String secret, int sent) {
    _failedAt = null;
    _sentMaxBytes = sent;
    _commands = commands;
    _secret = secret;
    _port = port;
    // A limit handed over while the proxy was starting.
    _syncMax();
  }

  static bool get _backedOff {
    final at = _failedAt;
    return at != null && DateTime.now().difference(at) < _retryAfter;
  }

  static bool get enabled =>
      !kIsWeb && ClientTuning.videoCacheMb > 0 && !_backedOff;

  /// The URL for the player. Sync on purpose (called from `initState`).
  ///
  /// [feed]: a feed / reel / channel video (aged out after a week by the
  /// «Автоудаление» of the feed; chat videos are not).
  static String resolve(String url, {bool feed = false}) {
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
      feed: feed,
    );
  }

  static Future<void> _ensureStarted() => _starting ??= () async {
        final ready = ReceivePort();
        Isolate? isolate;
        try {
          final base = await getTemporaryDirectory();
          final startMax = maxBytes;
          isolate = await Isolate.spawn<_ProxyStart>(
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
          final msg = await ready.first.timeout(const Duration(seconds: 10));
          if (msg is! (SendPort, int, String)) throw StateError('proxy');
          _attach(msg.$1, msg.$2, msg.$3, startMax);
        } on Object {
          // No (usable) answer: do not leave a proxy running that nobody
          // uses, and let a later video try again after a pause.
          isolate?.kill(priority: Isolate.immediate);
          _failedAt = DateTime.now();
          _starting = null;
        } finally {
          ready.close();
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
      } else if (m is (String, int) && m.$1 == 'trim') {
        await cache.trimTo(m.$2);
      } else if (m is (String, int) && m.$1 == 'age') {
        await cache.dropOlderThan(
          Duration(seconds: m.$2),
          onlyKeys: VideoCacheProxy.isFeedKey,
        );
      } else if (m is (String, SendPort) && m.$1 == 'clear') {
        await cache.clear();
        m.$2.send(true);
      }
    });
  s.reply.send((commands.sendPort, proxy.port, proxy.secret));
}
