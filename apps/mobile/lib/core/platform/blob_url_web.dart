import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

String? blobUrlFor(Uint8List bytes, String mimeType) {
  final blob = web.Blob(
    [bytes.toJS].toJS,
    web.BlobPropertyBag(type: mimeType),
  );
  return web.URL.createObjectURL(blob);
}

void revokeBlobUrl(String url) => web.URL.revokeObjectURL(url);
