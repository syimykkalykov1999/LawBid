import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/video_cache/chunk_cache.dart';
import 'package:lawbid/core/media/video_cache/range_plan.dart';
import 'package:lawbid/core/media/video_cache/video_cache_proxy.dart';

/// R-251: the blocks of a video's cached start, with a local server for the
/// CDN (latency per request, as a real link has).
void main() {
  const total = 3 * 1024 * 1024;
  const head = 2 * 1024 * 1024; // 8 blocks
  final bytes = Uint8List(total);
  for (var i = 0; i < total; i++) {
    bytes[i] = (i * 7 + (i >> 9)) & 0xff;
  }

  late HttpServer cdn;
  late Directory dir;
  late ChunkCache cache;
  late VideoCacheProxy proxy;
  late HttpClient player;
  var now = 0;
  var most = 0;
  var requests = 0;
  var latency = const Duration(milliseconds: 20);
  var failAt = (int n) => false;

  Future<void> serve(HttpRequest req) async {
    requests++;
    most = math.max(most, ++now);
    final n = requests;
    await Future<void>.delayed(latency);
    final m = RegExp(r'bytes=(\d+)-(\d+)')
        .firstMatch(req.headers.value(HttpHeaders.rangeHeader) ?? '');
    if (failAt(n)) {
      req.response.statusCode = 503;
    } else if (m != null) {
      final s = int.parse(m.group(1)!);
      final e = math.min(int.parse(m.group(2)!), total - 1);
      req.response
        ..statusCode = 206
        ..headers.set(HttpHeaders.contentRangeHeader, 'bytes $s-$e/$total')
        ..add(Uint8List.sublistView(bytes, s, e + 1));
    }
    now--;
    await req.response.close();
  }

  Future<VideoCacheProxy> start(int blocks) async {
    proxy = VideoCacheProxy(
      cache: cache,
      headBytes: head,
      hlsSeconds: 4,
      blocksAtOnce: blocks,
    )..allowHttpForTests = true;
    await proxy.start();
    return proxy;
  }

  Future<Uint8List> play({String? range}) async {
    final up = Uri.parse('http://127.0.0.1:${cdn.port}/v/clip.mp4?token=abc');
    final req = await player.getUrl(Uri.parse(proxy.wrap(up)));
    if (range != null) req.headers.set(HttpHeaders.rangeHeader, range);
    final res = await req.close();
    final out = BytesBuilder(copy: false);
    await res.forEach(out.add);
    return out.takeBytes();
  }

  setUp(() async {
    // flutter_test answers every real HTTP call with 400 otherwise.
    HttpOverrides.global = null;
    now = 0;
    most = 0;
    requests = 0;
    latency = const Duration(milliseconds: 20);
    failAt = (_) => false;
    cdn = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(cdn.forEach(serve));
    dir = Directory.systemTemp.createTempSync('blocks');
    cache = ChunkCache(dir, maxBytes: 50 * 1024 * 1024);
    player = HttpClient();
  });

  tearDown(() async {
    player.close(force: true);
    await proxy.stop();
    await cdn.close(force: true);
    dir.deleteSync(recursive: true);
  });

  test('off (1): one block after another, the bytes whole', () async {
    await start(1);
    expect(await play(), bytes);
    // size probe + the single tail; the blocks never overlap.
    expect(most, 1);
    expect(requests, 1 + head ~/ kBlockSize + 1);
  });

  test('on (4): several at once, in order, the same bytes and requests',
      () async {
    await start(4);
    expect(await play(), bytes);
    expect(most, 4);
    expect(requests, 1 + head ~/ kBlockSize + 1);
  });

  test('a second play of the head costs no block request', () async {
    await start(4);
    await play();
    requests = 0;
    expect(await play(range: 'bytes=0-${head - 1}'), hasLength(head));
    expect(requests, 0);
  });

  test('a range in the middle of the head is exact', () async {
    await start(4);
    const s = kBlockSize + 100;
    const e = 3 * kBlockSize + 5;
    expect(
      await play(range: 'bytes=$s-$e'),
      Uint8List.sublistView(bytes, s, e + 1),
    );
  });

  test('two requests at once share the same block fetches', () async {
    await start(4);
    final both = await Future.wait([
      play(range: 'bytes=0-${head - 1}'),
      play(range: 'bytes=0-${head - 1}'),
    ]);
    expect(both[0], both[1]);
    // size probes (up to 2) + each of the 8 blocks once.
    expect(requests, lessThanOrEqualTo(2 + head ~/ kBlockSize));
  });

  test('a failed block never fails the video: the rest is piped', () async {
    await start(4);
    failAt = (n) => n == 3; // the second block request
    final got = await play();
    expect(got, bytes);
  });
}
