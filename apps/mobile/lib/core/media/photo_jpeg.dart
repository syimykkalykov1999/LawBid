import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:lawbid/core/media/photo_jpeg_canvas_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/media/photo_jpeg_canvas_web.dart'
    as canvas;

/// Media audit 13.11 (R12, batch C): photos leave the phone as JPEG, never
/// PNG (a 2048 px photo as PNG is 3-6x the bytes of JPEG q90, measured in
/// test/core/media/photo_jpeg_test.dart).
///
/// The JPEG is written off the UI thread: on a phone the pure-Dart
/// `package:image` encoder (MIT, already used by the chat editor) runs in a
/// background isolate (`compute`); in the browser, where an isolate would run
/// on the page's own thread, the browser's native encoder does it
/// (`OffscreenCanvas.convertToBlob`, the way Chrome / Safari save a canvas;
/// MDN, 2025). The new file carries no metadata at all (no EXIF / GPS); the
/// pixels are already turned upright by the decoder.
///
/// A picture with see-through pixels returns null: JPEG has no alpha, so
/// the caller keeps its PNG (a sticker-like post photo stays as it was).
Future<Uint8List?> encodeRgbaJpeg(
  Uint8List rgba,
  int width,
  int height, {
  required int quality,
}) async {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return null;
  }
  final q = quality.clamp(1, 100);
  if (kIsWeb) {
    if (!isOpaqueRgba(rgba)) return null;
    try {
      final out = await canvas.canvasJpeg(rgba, width, height, q);
      if (out != null) return out;
    } on Object {
      // An old browser without OffscreenCanvas: the Dart encoder below.
    }
    return encodeJpegSync((rgba, width, height, q));
  }
  return compute(
    encodeJpegSync,
    (rgba, width, height, q),
    debugLabel: 'encodeRgbaJpeg',
  );
}

/// [image] as a JPEG (see [encodeRgbaJpeg]); null when it has transparency
/// or cannot be read.
Future<Uint8List?> encodeImageJpeg(
  ui.Image image, {
  required int quality,
}) async {
  final data =
      await image.toByteData(format: ui.ImageByteFormat.rawStraightRgba);
  if (data == null) return null;
  return encodeRgbaJpeg(
    data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
    image.width,
    image.height,
    quality: quality,
  );
}

/// Whether every pixel of [rgba] is fully opaque.
bool isOpaqueRgba(Uint8List rgba) {
  for (var i = 3; i < rgba.length; i += 4) {
    if (rgba[i] != 0xff) return false;
  }
  return true;
}

/// The isolate half of [encodeRgbaJpeg]: `(rgba, width, height, quality)`;
/// null when the picture is not opaque.
Uint8List? encodeJpegSync((Uint8List, int, int, int) a) {
  final (rgba, width, height, quality) = a;
  if (!isOpaqueRgba(rgba)) return null;
  final image = img.Image.fromBytes(
    width: width,
    height: height,
    bytes: rgba.buffer,
    bytesOffset: rgba.offsetInBytes,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  );
  return img.encodeJpg(image, quality: quality);
}

/// A photo at most [maxPx] on its long side, as a JPEG at [quality]: a photo
/// dropped on the website, a picture picked through «Files» or a verification
/// document (audit C5 / C7). The decoder turns it upright by its EXIF
/// orientation, so the new file needs none, and it carries no GPS.
///
/// A HEIC / HEIF (an iPhone original from «Files») is always rewritten as a
/// JPEG on the phone, small or not, where the phone can decode it; a small
/// JPEG / PNG / WebP is left as it is unless [always]. What cannot be
/// decoded, or has transparency, is returned unchanged (the server still
/// checks and converts it).
Future<Uint8List> shrinkPhotoToJpeg(
  Uint8List bytes, {
  required int maxPx,
  required int quality,
  bool always = false,
}) async {
  if (maxPx <= 0) return bytes;
  ui.ImmutableBuffer? buffer;
  ui.ImageDescriptor? descriptor;
  ui.Codec? codec;
  ui.Image? image;
  try {
    final heic = isHeic(bytes);
    buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    descriptor = await ui.ImageDescriptor.encoded(buffer);
    final w = descriptor.width;
    final h = descriptor.height;
    final big = w > maxPx || h > maxPx;
    if (!big && !heic && !always) return bytes;
    codec = await descriptor.instantiateCodec(
      targetWidth: big && w >= h ? maxPx : null,
      targetHeight: big && w < h ? maxPx : null,
    );
    image = (await codec.getNextFrame()).image;
    return await encodeImageJpeg(image, quality: quality) ?? bytes;
  } on Object {
    return bytes;
  } finally {
    image?.dispose();
    codec?.dispose();
    descriptor?.dispose();
    buffer?.dispose();
  }
}

/// Whether [bytes] is a HEIC / HEIF picture (ISO-BMFF `ftyp` brand).
bool isHeic(Uint8List bytes) {
  if (bytes.length < 12) return false;
  if (String.fromCharCodes(bytes.sublist(4, 8)) != 'ftyp') return false;
  const brands = {
    'heic',
    'heix',
    'hevc',
    'hevx',
    'heim',
    'heis',
    'mif1',
    'msf1',
  };
  return brands.contains(String.fromCharCodes(bytes.sublist(8, 12)));
}

/// [name] with a `.jpg` ending (a converted HEIC / PNG keeps its stem).
String jpegName(String name) {
  final dot = name.lastIndexOf('.');
  return '${dot > 0 ? name.substring(0, dot) : name}.jpg';
}
