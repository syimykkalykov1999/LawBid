import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/video_cache/range_plan.dart';

void main() {
  test('head size rounds up to whole blocks', () {
    expect(headBytesFor(seconds: 0), 0);
    expect(headBytesFor(seconds: 4), 1024 * 1024);
    expect(headBytesFor(seconds: 1, bytesPerSecond: 1000), kBlockSize);
  });

  test('blocks cover the request and stop at the cached head', () {
    final r = headBlocks(
      start: 300000,
      endInclusive: 600000,
      headBytes: kBlockSize * 2,
    );
    expect(r.map((b) => b.index), [1]);
    expect(r.first.header, 'bytes=262144-524287');
    final r2 = headBlocks(
      start: 0,
      endInclusive: 10000000,
      headBytes: kBlockSize * 2,
    );
    expect(r2.map((b) => b.index), [0, 1]);
    expect(
      headBlocks(
        start: kBlockSize * 2,
        endInclusive: 99999999,
        headBytes: kBlockSize * 2,
      ),
      isEmpty,
    );
    expect(headBlocks(start: 0, endInclusive: 5, headBytes: 0), isEmpty);
  });

  test('range header parsing', () {
    expect(parseRange('bytes=0-99', 1000), (0, 99));
    expect(parseRange('bytes=900-', 1000), (900, 999));
    expect(parseRange('bytes=-100', 1000), (900, 999));
    expect(parseRange('bytes=0-5000', 1000), (0, 999));
    expect(parseRange('bytes=2000-', 1000), isNull);
    expect(parseRange(null, 1000), isNull);
    expect(parseRange('junk', 1000), isNull);
  });

  test('total from Content-Range', () {
    expect(totalFromContentRange('bytes 0-0/12345'), 12345);
    expect(totalFromContentRange('bytes 0-0/*'), isNull);
    expect(totalFromContentRange(null), isNull);
  });

  const pl = '#EXTM3U\n#EXTINF:2.0,\ns0.ts\n#EXTINF:2.0,\ns1.ts\n'
      '#EXTINF:2.0,\ns2.ts\n#EXT-X-ENDLIST';

  test('segments inside the first seconds', () {
    expect(cachedSegmentCount(pl, 0), 0);
    expect(cachedSegmentCount(pl, 1), 1);
    expect(cachedSegmentCount(pl, 4), 2);
    expect(cachedSegmentCount(pl, 99), 3);
  });

  test('playlist rewrite caches only the head segments', () {
    final out = rewritePlaylist(
      pl,
      Uri.parse('https://cdn.x/v/index.m3u8'),
      2,
      (u, {required cache, required isPlaylist}) =>
          '${cache ? 'C' : 'X'}${isPlaylist ? 'P' : 'S'}:${u.path}',
    ).split('\n');
    expect(out.where((l) => l.isNotEmpty && !l.startsWith('#')).toList(), [
      'CS:/v/s0.ts',
      'CS:/v/s1.ts',
      'XS:/v/s2.ts',
    ]);
  });
}
