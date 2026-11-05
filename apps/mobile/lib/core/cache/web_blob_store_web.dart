import 'dart:js_interop';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/core/cache/web_blob_store.dart';
import 'package:web/web.dart' as web;

WebBlobStore createWebBlobStore() => BrowserBlobStore();

const _sizeHeader = 'x-lawbid-size';
const _atHeader = 'x-lawbid-at';

/// The browser's Cache Storage. Keys become `https://cache.lawbid.invalid/…`
/// requests (the API takes http(s) URLs only); the size and the write time
/// ride in two response headers so a listing never reads a body.
class BrowserBlobStore implements WebBlobStore {
  static const _host = 'https://cache.lawbid.invalid/';

  web.Request _req(String key) => web.Request(
        '$_host${Uri.encodeComponent(key)}'.toJS,
      );

  Future<web.Cache?> _open(String cache) async {
    try {
      return await web.window.caches.open(cache).toDart;
    } on Object catch (e) {
      // Private windows and blocked site data refuse the API.
      debugPrint('cache storage $cache: $e');
      return null;
    }
  }

  @override
  Future<void> put(String cache, String key, Uint8List bytes) async {
    final c = await _open(cache);
    if (c == null) return;
    try {
      final headers = web.Headers()
        ..set(_sizeHeader, '${bytes.length}')
        ..set(_atHeader, '${DateTime.now().millisecondsSinceEpoch}');
      final res = web.Response(
        bytes.toJS,
        web.ResponseInit(headers: headers),
      );
      await c.put(_req(key), res).toDart;
    } on Object catch (e) {
      // Over the quota, or the browser refused: the caller keeps working
      // without the copy.
      debugPrint('cache storage put $cache: $e');
    }
  }

  @override
  Future<Uint8List?> get(String cache, String key) async {
    final c = await _open(cache);
    if (c == null) return null;
    try {
      final res = await c.match(_req(key)).toDart;
      if (res == null) return null;
      final buf = await res.arrayBuffer().toDart;
      return buf.toDart.asUint8List();
    } on Object {
      return null;
    }
  }

  @override
  Future<void> delete(String cache, String key) async {
    final c = await _open(cache);
    if (c == null) return;
    try {
      await c.delete(_req(key)).toDart;
    } on Object {
      // Gone already.
    }
  }

  @override
  Future<List<WebBlob>> list(String cache) async {
    final c = await _open(cache);
    if (c == null) return const [];
    final out = <WebBlob>[];
    try {
      final keys = (await c.keys().toDart).toDart;
      for (final r in keys) {
        final res = await c.match(r).toDart;
        if (res == null) continue;
        final size = int.tryParse(res.headers.get(_sizeHeader) ?? '') ?? 0;
        final at = int.tryParse(res.headers.get(_atHeader) ?? '') ?? 0;
        final path = Uri.parse(r.url).path;
        final key = Uri.decodeComponent(
          path.startsWith('/') ? path.substring(1) : path,
        );
        final written = DateTime.fromMillisecondsSinceEpoch(at);
        out.add((key: key, bytes: size, written: written));
      }
    } on Object catch (e) {
      debugPrint('cache storage list $cache: $e');
    }
    return out;
  }

  @override
  Future<void> clear(String cache) async {
    try {
      await web.window.caches.delete(cache).toDart;
    } on Object catch (e) {
      debugPrint('cache storage clear $cache: $e');
    }
  }
}
