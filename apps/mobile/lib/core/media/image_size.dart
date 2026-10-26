import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart' show Size;

/// The pixel size of a picked picture, read from its header (no full decode),
/// so the outgoing bubble has its final shape before the upload ends.
Future<Size?> imageSizeOf(Uint8List bytes) async {
  ui.ImmutableBuffer? buffer;
  ui.ImageDescriptor? d;
  try {
    buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    d = await ui.ImageDescriptor.encoded(buffer);
    return Size(d.width.toDouble(), d.height.toDouble());
  } on Object {
    return null;
  } finally {
    d?.dispose();
    buffer?.dispose();
  }
}
