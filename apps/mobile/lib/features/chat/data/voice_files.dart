import 'dart:io';
import 'dart:typed_data';

/// OQ-040: the recorded note on the device (the recorder writes it into
/// the app's temp directory; it is removed once sent or discarded).
Future<Uint8List> readVoiceFile(String path) => File(path).readAsBytes();

Future<void> deleteVoiceFile(String? path) async {
  if (path == null) return;
  try {
    await File(path).delete();
  } on Object {
    // Already gone.
  }
}
