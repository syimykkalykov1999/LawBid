import 'dart:typed_data';

import 'package:lawbid/core/platform/web_download_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/web_download_web.dart'
    as impl;

/// Owner 2026-10-15 (web): the browser's way to «save to Files / share» —
/// hands [bytes] to the browser as a download named [filename]. Does
/// nothing outside the browser (the phone uses the system share sheet).
void saveBytesInBrowser(Uint8List bytes, String filename, String mimeType) =>
    impl.saveBytes(bytes, filename, mimeType);
