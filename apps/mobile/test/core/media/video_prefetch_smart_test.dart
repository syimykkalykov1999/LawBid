import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/video_cache/chunk_cache.dart';
import 'package:lawbid/core/media/video_cache/video_cache_proxy.dart';
import 'package:lawbid/core/media/video_prefetch.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

const _master = '''
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=240x426
240p/playlist.m3u8
''';

const _media = '''
#EXTM3U
#EXT-X-TARGETDURATION:4
#EXTINF:4.0,
video0.ts
#EXTINF:4.0,
video1.ts
''';

/// A CDN on the loopback: the real proxy believes it talks https (through
/// `connectionFactory`), every request and byte it sends out is counted.
class _Cdn {
  _Cdn(this._server) {
    unawaited(_server.forEach(_handle));
  }

  static Future<_Cdn> start() async =>
      _Cdn(await HttpServer.bind(InternetAddress.loopbackIPv4, 0));

  final HttpServer _server;
  final requests = <String>[];
  int sentBytes = 0;
  static final file = List<int>.generate(3 * 1024 * 1024, (i) => i % 251);

  HttpClient client() => HttpClient()
    ..connectionFactory = (uri, proxyHost, proxyPort) =>
        Socket.startConnect(InternetAddress.loopbackIPv4, _server.port);

  Future<void> _handle(HttpRequest req) async {
    requests.add(req.uri.path);
    final res = req.response;
    final path = req.uri.path;
    if (path.endsWith('.m3u8')) {
      final body = path.contains('240p') ? _media : _master;
      sentBytes += body.length;
      res.write(body);
    } else if (path.endsWith('.ts')) {
      sentBytes += 1000;
      res.add(List<int>.filled(1000, 7));
    } else {
      final m = RegExp(r'bytes=(\d+)-(\d+)?')
          .firstMatch(req.headers.value(HttpHeaders.rangeHeader) ?? '');
      final from = int.parse(m?.group(1) ?? '0');
      final to = int.parse(m?.group(2) ?? '${file.length - 1}')
          .clamp(0, file.length - 1);
      res
        ..statusCode = HttpStatus.partialContent
        ..headers.set(
          HttpHeaders.contentRangeHeader,
          'bytes $from-$to/${file.length}',
        );
      sentBytes += to - from + 1;
      res.add(file.sublist(from, to + 1));
    }
    await res.close();
  }

  Future<void> stop() => _server.close(force: true);
}

void main() {
  late Directory dir;
  late _Cdn cdn;
  late VideoCacheProxy proxy;
  late HlsPrefetcher warmer;

  // flutter_test answers every HttpClient with 400; this test needs real ones.
  setUpAll(() => HttpOverrides.global = null);

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('warm');
    cdn = await _Cdn.start();
    proxy = VideoCacheProxy(
      cache: ChunkCache(dir, maxBytes: 50 * 1024 * 1024),
      headBytes: 1024 * 1024,
      hlsSeconds: 4,
      client: cdn.client(),
    );
    await proxy.start();
    warmer = HlsPrefetcher()
      ..debugLocalDio = Dio()
      ..smart = (() => true)
      ..toLocal = (url) {
        final u = Uri.parse(url);
        return proxy.wrap(u, isPlaylist: u.path.endsWith('.m3u8'), feed: true);
      };
  });

  tearDown(() async {
    await proxy.stop();
    await cdn.stop();
    await dir.delete(recursive: true);
  });

  Future<void> settled() async {
    for (var i = 0; i < 200 && warmer.running + warmer.queued > 0; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
  }

  Future<int> playerReads(String url, int bytes) async {
    final u = Uri.parse(url);
    final local =
        proxy.wrap(u, isPlaylist: u.path.endsWith('.m3u8'), feed: true);
    final r = await Dio().get<List<int>>(
      local,
      options: Options(
        responseType: ResponseType.bytes,
        headers: {'Range': 'bytes=0-${bytes - 1}'},
      ),
    );
    return r.data!.length;
  }

  test('an MP4 warmed ahead: the player gets its start without the CDN',
      () async {
    const url = 'https://cdn.test/v/play_720p.mp4?token=a';
    warmer.prefetch(url);
    await settled();
    expect(warmer.warmed(url), isTrue);
    final before = cdn.requests.length;
    final sent = cdn.sentBytes;

    expect(await playerReads(url, 512 * 1024), 512 * 1024);

    expect(cdn.requests.length, before, reason: 'served from the disk cache');
    expect(cdn.sentBytes, sent);
  });

  test('an MP4 is warmed no further than the cache keeps', () async {
    warmer.prefetch('https://cdn.test/v/play_720p.mp4');
    await settled();
    // The size probe (1 byte) and the head blocks of the cache.
    expect(cdn.sentBytes, lessThanOrEqualTo(1024 * 1024 + 1));
  });

  test('HLS warmed ahead: the first segment is on disk for the player',
      () async {
    const url = 'https://cdn.test/v/playlist.m3u8';
    warmer.prefetch(url);
    await settled();
    expect(warmer.warmed(url), isTrue);
    expect(cdn.requests, contains('/v/240p/video0.ts'));
    final before = cdn.requests.where((p) => p.endsWith('.ts')).length;

    final seg = proxy.wrap(
      Uri.parse('https://cdn.test/v/240p/video0.ts'),
      feed: true,
    );
    final r = await Dio().get<List<int>>(
      seg,
      options: Options(responseType: ResponseType.bytes),
    );

    expect(r.data!.length, 1000);
    expect(cdn.requests.where((p) => p.endsWith('.ts')).length, before);
  });

  test('no cache: an MP4 costs nothing, later it can still be warmed',
      () async {
    const url = 'https://cdn.test/v/play_720p.mp4';
    warmer
      ..toLocal = ((u) => u)
      ..prefetch(url);
    await settled();
    expect(cdn.requests, isEmpty);
    expect(warmer.warmed(url), isFalse);
  });

  test('flag off: an MP4 link is ignored, as before', () async {
    warmer
      ..smart = (() => false)
      ..prefetch('https://cdn.test/v/play_720p.mp4');
    await settled();
    expect(warmer.queued + warmer.running, 0);
    expect(cdn.requests, isEmpty);
  });

  test('a player without the disk cache: the wish stays the old one', () {
    final calls = <String>[];
    final w = HlsPrefetcher(
      dio: Dio()..httpClientAdapter = _Refuse(),
    )
      ..smart = (() => true)
      ..toLocal = (u) {
        calls.add(u);
        return u;
      }
      ..prefetch('https://cdn.test/s/playlist.m3u8', viaCache: false);
    expect(calls, isEmpty);
  });

  group('SwipeWarm', () {
    var now = DateTime(2026, 11, 5);
    SwipeWarm make() => SwipeWarm(now: () => now);

    test('a calm viewer gets all of them, nothing dropped', () {
      final s = make();
      expect(s.next(['a', 'b', 'c']).warm, ['a', 'b', 'c']);
      now = now.add(const Duration(seconds: 5));
      final step = s.next(['b', 'c', 'd']);
      expect(step.warm, ['b', 'c', 'd']);
      expect(step.drop, ['a']);
    });

    test('flicking: only the next one, the rest is dropped', () {
      final s = make()..next(['a', 'b', 'c']);
      now = now.add(const Duration(milliseconds: 300));
      final step = s.next(['b', 'c', 'd']);
      expect(step.warm, ['b']);
      expect(step.drop, ['a', 'c']);
    });
  });

  group('PostVideo.warmUrl', () {
    const short = PostVideo(
      status: 'ready',
      playbackUrl: 'https://cdn.test/v/playlist.m3u8',
      fallbackUrl: 'https://cdn.test/v/play_720p.mp4',
      durationSec: 12,
    );

    test('smart: the stream the player opens', () {
      expect(short.warmUrl(smart: true), short.fallbackUrl);
    });

    test('off: the playlist, as before', () {
      expect(short.warmUrl(smart: false), short.playbackUrl);
    });

    test('not ready: nothing', () {
      const v = PostVideo(status: 'processing');
      expect(v.warmUrl(smart: true), isNull);
    });
  });
}

class _Refuse implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async =>
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'no network in this test',
      );

  @override
  void close({bool force = false}) {}
}
