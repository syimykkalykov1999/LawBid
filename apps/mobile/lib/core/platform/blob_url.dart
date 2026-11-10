import 'dart:typed_data';

import 'package:lawbid/core/platform/blob_url_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/blob_url_web.dart'
    as impl;

/// SPEED_MATRIX 2026-11-09 §2.3 (site): the browser's address of bytes the
/// page holds (`URL.createObjectURL`) — what `<audio>` / `<video>` play
/// without a network request. Null outside the browser. Revoke it with
/// [revokeBlobUrl] when the bytes are no longer played (the browser keeps
/// them alive until then).
String? blobUrlFor(Uint8List bytes, String mimeType) =>
    impl.blobUrlFor(bytes, mimeType);

void revokeBlobUrl(String url) => impl.revokeBlobUrl(url);
