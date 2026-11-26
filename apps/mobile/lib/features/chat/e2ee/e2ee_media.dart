import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:lawbid/core/platform/blob_url.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_media_server_stub.dart'
    if (dart.library.io) 'package:lawbid/features/chat/e2ee/e2ee_media_server_io.dart'
    as server;

/// The decrypted bytes of an encrypted chat file and their type.
typedef E2eeMediaBytes = ({Uint8List bytes, String mime});

/// Item 25, PR 4 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §5): the
/// address the app's image loader, video and voice players and document
/// opener read an end-to-end encrypted chat file from. Storage holds only
/// ciphertext, so every one of them is handed a LOCAL address of the
/// decrypted bytes, the way Element Web shows encrypted media (a `blob:`
/// URL in the browser); on the phone a loopback server on 127.0.0.1 with a
/// random path per launch (answers Range requests, which AVPlayer and
/// ExoPlayer need). The plaintext never leaves the device.
abstract final class E2eeMedia {
  /// Set by the signed-in account's E2eeService: the bytes of a file.
  static Future<E2eeMediaBytes?> Function(String fileId)? resolve;

  static final Map<String, String> _blobs = {};

  /// The local address of [fileId] when it can be read now (null: not yet).
  static String? urlOf(String fileId) {
    final blob = _blobs[fileId];
    if (blob != null) return blob;
    if (kIsWeb) return null;
    final base = server.base;
    return base == null ? null : '$base/$fileId';
  }

  /// Starts the loopback server (phone); nothing in the browser.
  static Future<void> warm() async {
    if (!kIsWeb) await server.start(() => resolve);
  }

  /// Makes [fileId] readable: in the browser it is downloaded and
  /// decrypted into a `blob:` URL; on the phone the server decrypts it on
  /// the first request. The address, or null when it cannot be opened.
  static Future<String?> prepare(String fileId) async {
    final hit = urlOf(fileId);
    if (hit != null) return hit;
    if (!kIsWeb) {
      await warm();
      return urlOf(fileId);
    }
    final r = await resolve?.call(fileId);
    if (r == null) return null;
    final url = blobUrlFor(r.bytes, r.mime);
    if (url == null) return null;
    _blobs[fileId] = url;
    // The browser keeps a blob alive until it is revoked: the oldest go.
    while (_blobs.length > 80) {
      revokeBlobUrl(_blobs.remove(_blobs.keys.first)!);
    }
    return url;
  }

  /// Signed out: the addresses go.
  static void clear() {
    for (final u in _blobs.values) {
      revokeBlobUrl(u);
    }
    _blobs.clear();
  }
}
