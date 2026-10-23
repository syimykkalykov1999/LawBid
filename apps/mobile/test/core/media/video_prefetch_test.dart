import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/video_prefetch.dart';

const _master = '''
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=720x1280
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=400000,AVERAGE-BANDWIDTH=350000,RESOLUTION=240x426
240p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=480x854
480p/playlist.m3u8
''';

const _media = '''
#EXTM3U
#EXT-X-TARGETDURATION:4
#EXTINF:4.0,
video0.ts
#EXTINF:4.0,
video1.ts
''';

/// Answers playlists and segments from memory; each request waits for
/// [gate] when it is set, so a test can hold the fetches in flight.
class _Net implements HttpClientAdapter {
  final requests = <String>[];
  Completer<void>? gate;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options.uri.toString());
    if (gate != null) await gate!.future;
    final path = options.uri.path;
    final body = path.endsWith('/playlist.m3u8') && path.contains('p/')
        ? _media
        : path.endsWith('.m3u8')
            ? _master
            : 'segment-bytes';
    return ResponseBody.fromString(body, 200);
  }

  @override
  void close({bool force = false}) {}
}

HlsPrefetcher _make(_Net net, {int concurrent = 2, int remembered = 16}) =>
    HlsPrefetcher(
      dio: Dio()..httpClientAdapter = net,
      maxConcurrent: concurrent,
      maxRemembered: remembered,
    );

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  test('picks the lowest-bandwidth rendition and its first segment', () {
    final base = Uri.parse('https://cdn.test/abc/playlist.m3u8');
    final low = lowestRenditionUri(_master, base)!;
    expect(low.toString(), 'https://cdn.test/abc/240p/playlist.m3u8');
    expect(
      firstSegmentUri(_media, low).toString(),
      'https://cdn.test/abc/240p/video0.ts',
    );
    // A media playlist has no variants.
    expect(lowestRenditionUri(_media, base), isNull);
  });

  test('fetches master, lowest playlist and only the first segment', () async {
    final net = _Net();
    final p = _make(net)..prefetch('https://cdn.test/abc/playlist.m3u8');
    await _settle();
    expect(net.requests, [
      'https://cdn.test/abc/playlist.m3u8',
      'https://cdn.test/abc/240p/playlist.m3u8',
      'https://cdn.test/abc/240p/video0.ts',
    ]);
    expect(p.warmed('https://cdn.test/abc/playlist.m3u8'), isTrue);
    // A second wish for the same stream costs nothing.
    p.prefetch('https://cdn.test/abc/playlist.m3u8');
    await _settle();
    expect(net.requests, hasLength(3));
  });

  test('ignores plain MP4 links', () async {
    final net = _Net();
    _make(net).prefetch('https://cdn.test/v.mp4');
    await _settle();
    expect(net.requests, isEmpty);
  });

  test('is bounded: concurrency, waiting wishes and remembered streams',
      () async {
    final net = _Net()..gate = Completer<void>();
    final p = _make(net, remembered: 3);
    for (var i = 0; i < 10; i++) {
      p.prefetch('https://cdn.test/v$i/playlist.m3u8');
    }
    await _settle();
    expect(p.running, 2);
    expect(p.queued, lessThanOrEqualTo(4));
    net.gate!.complete();
    await Future<void>.delayed(const Duration(milliseconds: 200));
    expect(p.running, 0);
    expect(p.rememberedCount, lessThanOrEqualTo(3));
  });

  test('cancelAll drops waiting wishes', () async {
    final net = _Net()..gate = Completer<void>();
    final p = _make(net, concurrent: 1)
      ..prefetchAll([
        'https://cdn.test/a/playlist.m3u8',
        'https://cdn.test/b/playlist.m3u8',
        'https://cdn.test/c/playlist.m3u8',
      ])
      ..cancelAll();
    expect(p.queued, 0);
    net.gate!.complete();
  });

  group('WarmPlan', () {
    test('one player ahead and one behind, three streams prefetched', () {
      final plan = WarmPlan.at(5, 20);
      expect(plan.players, {4, 6});
      expect(plan.prefetch, [6, 7, 8]);
      expect(plan.players.length, lessThanOrEqualTo(WarmPlan.maxPlayers));
    });

    test('stays inside the list at both ends', () {
      expect(WarmPlan.at(0, 20).players, {1});
      expect(WarmPlan.at(19, 20).players, {18});
      expect(WarmPlan.at(19, 20).prefetch, isEmpty);
      expect(WarmPlan.at(18, 20).prefetch, [19]);
      expect(WarmPlan.at(0, 1).players, isEmpty);
    });
  });
}
