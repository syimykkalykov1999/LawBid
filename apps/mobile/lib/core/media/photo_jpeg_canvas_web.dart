import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

/// The browser's own JPEG encoder (audit D9): the pixels go onto an
/// `OffscreenCanvas` and `convertToBlob({type: 'image/jpeg'})` writes the
/// file natively, off the page's Dart code (Chrome 69+, Firefox 105+,
/// Safari 16.4+; MDN «OffscreenCanvas: convertToBlob()», 2025). Null when
/// the browser has no OffscreenCanvas (the caller falls back).
Future<Uint8List?> canvasJpeg(
  Uint8List rgba,
  int width,
  int height,
  int quality,
) async {
  if (!globalContext.has('OffscreenCanvas')) return null;
  final canvas = web.OffscreenCanvas(width, height);
  final ctx = canvas.getContext('2d') as web.OffscreenCanvasRenderingContext2D?;
  if (ctx == null) return null;
  final pixels = Uint8ClampedList.sublistView(rgba, 0, width * height * 4);
  ctx.putImageData(web.ImageData(pixels.toJS, width, height.toJS), 0, 0);
  final blob = await canvas
      .convertToBlob(
        web.ImageEncodeOptions(type: 'image/jpeg', quality: quality / 100),
      )
      .toDart;
  if (blob.type != 'image/jpeg') return null;
  final buffer = await blob.arrayBuffer().toDart;
  return buffer.toDart.asUint8List();
}
