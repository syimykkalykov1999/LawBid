import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/media/video_size.dart';

List<int> _box(String type, List<int> body) {
  final n = 8 + body.length;
  return [
    (n >> 24) & 255,
    (n >> 16) & 255,
    (n >> 8) & 255,
    n & 255,
    ...type.codeUnits,
    ...body,
  ];
}

List<int> _u32(int v) =>
    [(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];

/// A tkhd (version 0) with the given matrix a / b and size in pixels.
List<int> _tkhd(int w, int h, {int a = 0x10000, int b = 0}) => _box('tkhd', [
      0, 0, 0, 0, // version + flags
      ...List.filled(20, 0), // times, id, reserved, duration
      ...List.filled(8, 0), // reserved
      ...List.filled(8, 0), // layer, group, volume, reserved
      ..._u32(a), ..._u32(b), ..._u32(0),
      ..._u32(0), ..._u32(0x10000), ..._u32(0),
      ..._u32(0), ..._u32(0), ..._u32(0x40000000),
      ..._u32(w << 16), ..._u32(h << 16),
    ]);

Uint8List _file(List<int> tkhd) => Uint8List.fromList([
      ..._box('ftyp', List.filled(8, 0)),
      ..._box('moov', _box('trak', tkhd)),
    ]);

void main() {
  test('reads the size of a landscape video', () {
    expect(videoSizeOf(_file(_tkhd(1920, 1080))), const Size(1920, 1080));
  });

  test('a phone video stored sideways comes back upright', () {
    expect(
      videoSizeOf(_file(_tkhd(1920, 1080, a: 0, b: 0x10000))),
      const Size(1080, 1920),
    );
  });

  test('no video track means no size', () {
    expect(videoSizeOf(_file(_tkhd(0, 0))), isNull);
    expect(videoSizeOf(Uint8List(3)), isNull);
  });

  group('videoSizeOfFile (R-255): on disk, without reading the video', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('vs'));
    tearDown(() => dir.deleteSync(recursive: true));

    List<int> moov() => _box('moov', _box('trak', _tkhd(1920, 1080)));

    /// ftyp, a sparse mdat of [mdat] bytes (no disk, no time), then [tail].
    XFile video(int mdat, List<int> tail) {
      final f = File('${dir.path}/v.mp4');
      final io = f.openSync(mode: FileMode.write)
        ..writeFromSync(_box('ftyp', List.filled(16, 0)))
        ..writeFromSync(_u32(mdat + 8))
        ..writeFromSync('mdat'.codeUnits);
      io
        ..setPositionSync(io.positionSync() + mdat)
        ..writeFromSync(tail)
        ..closeSync();
      return XFile(f.path);
    }

    test('moov after 1 GB of video: found by the headers alone', () async {
      expect(
        await videoSizeOfFile(video(1 << 30, moov())),
        const Size(1920, 1080),
      );
    });

    test('moov first (fast start)', () async {
      final f = File('${dir.path}/fast.mp4')
        ..writeAsBytesSync([
          ..._box('ftyp', List.filled(16, 0)),
          ...moov(),
          ..._box('mdat', List.filled(100, 1)),
        ]);
      expect(await videoSizeOfFile(XFile(f.path)), const Size(1920, 1080));
    });

    test('no moov, or a broken box: no size, no error', () async {
      expect(await videoSizeOfFile(video(100, const [])), isNull);
      final f = File('${dir.path}/bad.mp4')..writeAsBytesSync([0, 0, 0, 3, 1]);
      expect(await videoSizeOfFile(XFile(f.path)), isNull);
      final g = File('${dir.path}/empty.mp4')..writeAsBytesSync(const []);
      expect(await videoSizeOfFile(XFile(g.path)), isNull);
    });

    test('an absurd moov is not read', () async {
      final f = File('${dir.path}/huge.mp4');
      f.openSync(mode: FileMode.write)
        ..writeFromSync(_u32(100 * 1024 * 1024))
        ..writeFromSync('moov'.codeUnits)
        ..truncateSync(100 * 1024 * 1024)
        ..closeSync();
      expect(await videoSizeOfFile(XFile(f.path)), isNull);
    });
  });
}
