import 'dart:js_interop';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:web/web.dart' as web;

/// Media audit 13.11 (D9): the browser hashes bytes with its own native
/// SHA-256 (`crypto.subtle.digest`, off the page's Dart code; MDN, 2025);
/// Dart's isolates would run on the page's thread here. Without
/// SubtleCrypto (an insecure page) the Dart hash is used.
Future<String> sha256OfBytes(Uint8List bytes) async {
  try {
    final digest = await web.window.crypto.subtle
        .digest('SHA-256'.toJS, bytes.toJS)
        .toDart;
    return _hex((digest! as JSArrayBuffer).toDart.asUint8List());
  } on Object {
    return sha256.convert(bytes).toString();
  }
}

/// A browser file (a blob URL) is streamed through the Dart hash: the
/// browser's digest has no streaming form and would need it whole in memory.
Future<String> sha256OfFile(String path) async =>
    (await sha256.bind(XFile(path).openRead()).first).toString();

String _hex(Uint8List b) {
  final out = StringBuffer();
  for (final x in b) {
    out.write(x.toRadixString(16).padLeft(2, '0'));
  }
  return out.toString();
}
