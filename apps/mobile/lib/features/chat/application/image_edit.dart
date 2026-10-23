import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

/// Owner 2026-10-22 (WhatsApp): rotate / crop a photo before sending it.
///
/// Done with `dart:ui` (decode, turn, cut) and the pure-Dart `image`
/// package only to write the JPEG (dart:ui can only write PNG, 3-4x the
/// bytes of the 1600 px / q82 photo the chat sends). No native plugin, so
/// it works on the web too.
@immutable
class ImageEdit {
  const ImageEdit({this.quarterTurns = 0, this.crop});

  /// Clockwise quarter turns, 0..3.
  final int quarterTurns;

  /// The kept part of the TURNED picture, as fractions (0..1) of it.
  final ui.Rect? crop;

  bool get isIdentity =>
      quarterTurns % 4 == 0 &&
      (crop == null ||
          (crop!.left <= 0.001 &&
              crop!.top <= 0.001 &&
              crop!.right >= 0.999 &&
              crop!.bottom >= 0.999));

  ImageEdit turned() => ImageEdit(quarterTurns: (quarterTurns + 1) % 4);
}

/// The size of a picture of [w] x [h] after [turns] quarter turns.
ui.Size turnedSize(double w, double h, int turns) =>
    turns.isOdd ? ui.Size(h, w) : ui.Size(w, h);

/// Applies [edit] to the encoded picture [bytes]; returns a JPEG.
Future<Uint8List> applyImageEdit(Uint8List bytes, ImageEdit edit) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final frame = await codec.getNextFrame();
  final src = frame.image;
  codec.dispose();
  final turns = edit.quarterTurns % 4;
  final w = src.width.toDouble();
  final h = src.height.toDouble();
  final full = turnedSize(w, h, turns);
  final c = edit.crop;
  final keep = c == null
      ? ui.Rect.fromLTWH(0, 0, full.width, full.height)
      : ui.Rect.fromLTRB(
          (c.left * full.width).roundToDouble(),
          (c.top * full.height).roundToDouble(),
          (c.right * full.width).roundToDouble(),
          (c.bottom * full.height).roundToDouble(),
        );
  final outW = math.max(1, keep.width.round());
  final outH = math.max(1, keep.height.round());

  final rec = ui.PictureRecorder();
  final canvas = ui.Canvas(rec)
    ..clipRect(ui.Rect.fromLTWH(0, 0, outW.toDouble(), outH.toDouble()))
    ..translate(-keep.left, -keep.top);
  switch (turns) {
    case 1:
      canvas
        ..translate(h, 0)
        ..rotate(math.pi / 2);
    case 2:
      canvas
        ..translate(w, h)
        ..rotate(math.pi);
    case 3:
      canvas
        ..translate(0, w)
        ..rotate(3 * math.pi / 2);
  }
  canvas.drawImage(
    src,
    ui.Offset.zero,
    ui.Paint()..filterQuality = ui.FilterQuality.high,
  );
  final picture = rec.endRecording();
  final out = await picture.toImage(outW, outH);
  final data = await out.toByteData();
  src.dispose();
  out.dispose();
  picture.dispose();
  if (data == null) return bytes;
  final rgba = data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  return compute(_encodeJpeg, (rgba, outW, outH));
}

Uint8List _encodeJpeg((Uint8List, int, int) a) {
  final image = img.Image.fromBytes(
    width: a.$2,
    height: a.$3,
    bytes: a.$1.buffer,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  );
  return Uint8List.fromList(img.encodeJpg(image, quality: 85));
}

/// The name of an edited picture: same stem, `.jpg`.
String editedName(String name) {
  final dot = name.lastIndexOf('.');
  return '${dot > 0 ? name.substring(0, dot) : name}.jpg';
}
