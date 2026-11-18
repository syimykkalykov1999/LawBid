import 'dart:async';
import 'dart:js_interop';

import 'package:image_picker/image_picker.dart' show XFile;
import 'package:web/web.dart' as web;

void Function() listenForPastedFiles(
  void Function(List<XFile> files) onFiles, {
  required bool Function() accept,
}) {
  void onPaste(web.ClipboardEvent e) {
    final data = e.clipboardData;
    final files = data?.files;
    if (data == null || files == null || files.length == 0) return;
    // Text copied together with a picture (a document) pastes as text.
    if (data.getData('text/plain').trim().isNotEmpty) return;
    if (!accept()) return;
    e.preventDefault();
    final picked = [for (var i = 0; i < files.length; i++) files.item(i)!];
    unawaited(() async {
      final out = <XFile>[];
      for (final f in picked) {
        final bytes = (await f.arrayBuffer().toDart).toDart.asUint8List();
        out.add(
          XFile.fromData(
            bytes,
            name: f.name.isEmpty ? 'pasted.png' : f.name,
            mimeType: f.type,
            length: bytes.length,
          ),
        );
      }
      if (out.isNotEmpty) onFiles(out);
    }());
  }

  final handler = onPaste.toJS;
  web.document.addEventListener('paste', handler);
  return () => web.document.removeEventListener('paste', handler);
}
