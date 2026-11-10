import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/web_video_warm.dart';

class _Elements implements VideoWarmElements {
  final opened = <String>[];
  final closed = <String>[];

  @override
  void open(String url) => opened.add(url);

  @override
  void close(String url) => closed.add(url);
}

/// B-c2 (b), 2026-11-09: the site warms the heads of the next reels (the
/// browser plays the MP4 copy; the phone's HLS warm-up reads nothing there).
void main() {
  late _Elements el;
  late WebVideoWarm warm;

  setUp(() {
    el = _Elements();
    warm = WebVideoWarm(elements: el);
  });

  const a = 'https://x.b-cdn.net/a/play_720p.mp4';
  const b = 'https://x.b-cdn.net/b/play_720p.mp4';
  const c = 'https://x.b-cdn.net/c/play_720p.mp4';

  test('at most two heads, nearest first', () {
    warm.warm([a, b, c]);
    expect(el.opened, [a, b]);
    expect(warm.warming, [a, b]);
  });

  test('the next page keeps what is still wished and drops the rest', () {
    warm
      ..warm([a, b])
      ..warm([b, c]);
    expect(el.closed, [a]);
    expect(el.opened, [a, b, c]);
    expect(warm.warming, [b, c]);
  });

  test('the phone gate (admin off, data saver) closes everything', () {
    warm
      ..warm([a, b])
      ..allow = (() => false)
      ..warm([a, b, c]);
    expect(el.closed, [a, b]);
    expect(warm.warming, isEmpty);
  });

  test('leaving the reels closes the heads; odd links are ignored', () {
    warm.warm(['blob:local', a, a]);
    expect(el.opened, [a]);
    warm.clear();
    expect(el.closed, [a]);
  });
}
