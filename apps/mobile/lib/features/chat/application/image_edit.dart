import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/media/photo_jpeg.dart';

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

  /// This edit, then [next] on its result, as one edit of the first
  /// picture (row 199: a rotate, a crop and another rotate are drawn from
  /// the original once, never one JPEG after another).
  ImageEdit then(ImageEdit next) {
    final t = next.quarterTurns % 4;
    // This crop, turned with the picture [t] quarter turns clockwise: a
    // point (x, y) of the picture goes to (1 - y, x) on each turn.
    var r = crop ?? const ui.Rect.fromLTRB(0, 0, 1, 1);
    for (var i = 0; i < t; i++) {
      r = ui.Rect.fromLTRB(1 - r.bottom, r.left, 1 - r.top, r.right);
    }
    final n = next.crop;
    if (n != null) {
      r = ui.Rect.fromLTRB(
        r.left + n.left * r.width,
        r.top + n.top * r.height,
        r.left + n.right * r.width,
        r.top + n.bottom * r.height,
      );
    }
    final whole = r.left <= 0.001 &&
        r.top <= 0.001 &&
        r.right >= 0.999 &&
        r.bottom >= 0.999;
    return ImageEdit(
      quarterTurns: (quarterTurns + t) % 4,
      crop: whole ? null : r,
    );
  }
}

/// Row 199 (WhatsApp / Telegram: one compression of an edited photo): how
/// to read the untouched picture a chat photo was made from, by the bytes
/// shown. The preview edits that one, so the photo sent is encoded once.
final _originals = Expando<Future<Uint8List> Function()>('chat photo original');

/// Remembers how to read the original of [shown].
void rememberPhotoOriginal(
  Uint8List shown,
  Future<Uint8List> Function() original,
) =>
    _originals[shown] = original;

/// How to read the original of [shown]; null when none was kept.
Future<Uint8List> Function()? photoOriginalOf(Uint8List shown) =>
    _originals[shown];

/// Lets the original of [shown] go (the photo was sent or dropped).
void forgetPhotoOriginal(Uint8List shown) => _originals[shown] = null;

/// The size of a picture of [w] x [h] after [turns] quarter turns.
ui.Size turnedSize(double w, double h, int turns) =>
    turns.isOdd ? ui.Size(h, w) : ui.Size(w, h);

/// Applies [edit] to the encoded picture [bytes]; returns a JPEG.
///
/// [maxPx] (row 199): the longest side of the result. The gallery original
/// is decoded only as large as the kept part needs, then turned, cut and
/// written as one JPEG: one compression in all.
Future<Uint8List> applyImageEdit(
  Uint8List bytes,
  ImageEdit edit, {
  int? maxPx,
}) async {
  final turns = edit.quarterTurns % 4;
  final c = edit.crop ?? const ui.Rect.fromLTRB(0, 0, 1, 1);
  final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
  final descriptor = await ui.ImageDescriptor.encoded(buffer);
  // The decoder makes the picture just big enough for the kept part to
  // fit [maxPx] (sharper and lighter than a big picture drawn small).
  final turned0 = turnedSize(
    descriptor.width.toDouble(),
    descriptor.height.toDouble(),
    turns,
  );
  final keepLong = math.max(c.width * turned0.width, c.height * turned0.height);
  final s0 =
      maxPx == null || maxPx <= 0 || keepLong <= maxPx ? 1.0 : maxPx / keepLong;
  final codec = await descriptor.instantiateCodec(
    targetWidth: s0 < 1 ? math.max(1, (descriptor.width * s0).round()) : null,
    targetHeight: s0 < 1 ? math.max(1, (descriptor.height * s0).round()) : null,
  );
  final frame = await codec.getNextFrame();
  final src = frame.image;
  codec.dispose();
  descriptor.dispose();
  buffer.dispose();
  final w = src.width.toDouble();
  final h = src.height.toDouble();
  final full = turnedSize(w, h, turns);
  final keep = ui.Rect.fromLTRB(
    (c.left * full.width).roundToDouble(),
    (c.top * full.height).roundToDouble(),
    (c.right * full.width).roundToDouble(),
    (c.bottom * full.height).roundToDouble(),
  );
  // A decoder that did not shrink as asked: drawn smaller instead.
  final long = math.max(keep.width, keep.height);
  final s = maxPx == null || maxPx <= 0 || long <= maxPx ? 1.0 : maxPx / long;
  final outW = math.max(1, (keep.width * s).round());
  final outH = math.max(1, (keep.height * s).round());

  final rec = ui.PictureRecorder();
  final canvas = ui.Canvas(rec)
    ..clipRect(ui.Rect.fromLTWH(0, 0, outW.toDouble(), outH.toDouble()))
    ..scale(s)
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
    // Flutter: `high` is for scaling up, `medium` (mipmaps) for down.
    ui.Paint()
      ..filterQuality = s < 1 ? ui.FilterQuality.medium : ui.FilterQuality.high,
  );
  final picture = rec.endRecording();
  final out = await picture.toImage(outW, outH);
  final data = await out.toByteData(format: ui.ImageByteFormat.rawStraightRgba);
  src.dispose();
  out.dispose();
  picture.dispose();
  if (data == null) return bytes;
  final rgba = data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  // Media audit 13.11 (D9): the browser's own encoder on the website (an
  // isolate there runs on the page's thread and froze the tab), a
  // background isolate on a phone; the admin's chat photo quality.
  final quality = ClientTuning.chatPhotoQuality;
  return await encodeRgbaJpeg(rgba, outW, outH, quality: quality) ??
      // A see-through picture: JPEG anyway (a chat photo is JPEG).
      await compute(_encodeJpeg, (rgba, outW, outH, quality));
}

Uint8List _encodeJpeg((Uint8List, int, int, int) a) {
  final image = img.Image.fromBytes(
    width: a.$2,
    height: a.$3,
    bytes: a.$1.buffer,
    bytesOffset: a.$1.offsetInBytes,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  );
  return Uint8List.fromList(img.encodeJpg(image, quality: a.$4));
}

/// The name of an edited picture: same stem, `.jpg`.
String editedName(String name) {
  final dot = name.lastIndexOf('.');
  return '${dot > 0 ? name.substring(0, dot) : name}.jpg';
}
