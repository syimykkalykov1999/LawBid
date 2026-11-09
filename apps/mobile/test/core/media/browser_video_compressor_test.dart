import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/media/browser_video_compressor.dart';

class _Encoder implements BrowserVideoEncoder {
  _Encoder({this.supported = true, this.result, this.fails = false});

  @override
  final bool supported;
  final XFile? result;
  final bool fails;
  int calls = 0;
  ({int maxShortSide, int frameRate})? asked;

  @override
  Future<XFile?> encode(
    XFile source, {
    required int maxShortSide,
    required int frameRate,
    void Function(double progress)? onProgress,
  }) async {
    calls++;
    asked = (maxShortSide: maxShortSide, frameRate: frameRate);
    if (fails) throw StateError('encoder broke');
    return result;
  }

  @override
  Future<void> cancel() async {}
}

XFile _video(int size) =>
    XFile.fromData(Uint8List(size), mimeType: 'video/mp4', name: 'v.mp4');

/// Owner 2026-11-08: a video sent from the website is re-encoded with the
/// admin's limits when the browser can; otherwise the original goes up.
void main() {
  const limits = (maxHeight: 720, frameRate: 30);

  test('no WebCodecs in this browser: the original is uploaded', () async {
    final e = _Encoder(supported: false, result: _video(10));
    final out = await BrowserVideoCompressor(e)
        .compress(_video(1000), limits: limits);
    expect(out, isNull);
    expect(e.calls, 0);
  });

  test('an encoder error or a bigger result: the original is uploaded',
      () async {
    for (final e in [
      _Encoder(fails: true),
      _Encoder(result: _video(2000)),
      _Encoder(), // the browser lacked a codec: null
    ]) {
      expect(
        await BrowserVideoCompressor(e).compress(_video(1000), limits: limits),
        isNull,
      );
    }
  });

  test("the admin's size and frame rate are used, a smaller file is kept",
      () async {
    final e = _Encoder(result: _video(300));
    final out = await BrowserVideoCompressor(e)
        .compress(_video(1000), limits: limits);
    expect(await out!.length(), 300);
    expect(e.asked, (maxShortSide: 720, frameRate: 30));
  });

  test('the admin turned re-encoding off (0): nothing is done', () async {
    final e = _Encoder(result: _video(300));
    final out = await BrowserVideoCompressor(e)
        .compress(_video(1000), limits: (maxHeight: 0, frameRate: 30));
    expect(out, isNull);
    expect(e.calls, 0);
  });
}
