import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
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
}
