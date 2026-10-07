import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart' show XFile;

/// OQ-040: the recorded note on the device (the recorder writes it into
/// the app's temp directory; it is removed once sent or discarded). In
/// the browser the recorder gives a `blob:` URL, which XFile reads too.
Future<Uint8List> readVoiceFile(String path) => XFile(path).readAsBytes();

Future<void> deleteVoiceFile(String? path) async {
  // The browser frees a blob URL with the page.
  if (path == null || kIsWeb) return;
  try {
    await File(path).delete();
  } on Object {
    // Already gone.
  }
}
