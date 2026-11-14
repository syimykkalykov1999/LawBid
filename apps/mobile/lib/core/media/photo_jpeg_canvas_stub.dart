import 'dart:typed_data';

/// Phones and tests: no browser canvas (the isolate encoder is used).
Future<Uint8List?> canvasJpeg(
  Uint8List rgba,
  int width,
  int height,
  int quality,
) async =>
    null;
