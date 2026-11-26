import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show debugPrint;

/// The loopback server of E2eeMedia on the phone: `GET /<token>/<fileId>`
/// answers the decrypted bytes (whole, or the asked `Range`), only on
/// 127.0.0.1 and only to a caller that knows this launch's random token.
String? _base;
Future<void>? _starting;

String? get base => _base;

Future<void> start(
  Future<({Uint8List bytes, String mime})?> Function(String fileId)? Function()
      resolver,
) =>
    _starting ??= _start(resolver).catchError((Object e) {
      debugPrint('e2ee media server: $e');
      _starting = null;
    });

Future<void> _start(
  Future<({Uint8List bytes, String mime})?> Function(String fileId)? Function()
      resolver,
) async {
  // Started by the first encrypted file shown; no idle timer (the players
  // keep their own connections).
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0)
    ..idleTimeout = null;
  final r = Random.secure();
  final token = [
    for (var i = 0; i < 16; i++)
      r.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ].join();
  server.listen((req) => unawaited(_serve(req, token, resolver)));
  _base = 'http://127.0.0.1:${server.port}/$token';
}

Future<void> _serve(
  HttpRequest req,
  String token,
  Future<({Uint8List bytes, String mime})?> Function(String fileId)? Function()
      resolver,
) async {
  final res = req.response;
  try {
    final seg = req.uri.pathSegments;
    final resolve = resolver();
    if (seg.length != 2 || seg[0] != token || resolve == null) {
      res.statusCode = HttpStatus.notFound;
      return;
    }
    final file = await resolve(seg[1]);
    if (file == null) {
      res.statusCode = HttpStatus.notFound;
      return;
    }
    final bytes = file.bytes;
    final total = bytes.length;
    var start = 0;
    var end = total - 1;
    final range = RegExp(r'^bytes=(\d*)-(\d*)$')
        .firstMatch(req.headers.value(HttpHeaders.rangeHeader) ?? '');
    res.headers
      ..contentType = ContentType.parse(file.mime)
      ..set(HttpHeaders.acceptRangesHeader, 'bytes')
      ..set(HttpHeaders.cacheControlHeader, 'no-store');
    if (range != null) {
      final a = range.group(1)!;
      final b = range.group(2)!;
      if (a.isEmpty && b.isNotEmpty) {
        start = max(0, total - int.parse(b));
      } else {
        start = a.isEmpty ? 0 : int.parse(a);
        if (b.isNotEmpty) end = min(end, int.parse(b));
      }
      if (start >= total || start > end) {
        res
          ..statusCode = HttpStatus.requestedRangeNotSatisfiable
          ..headers.set(HttpHeaders.contentRangeHeader, 'bytes */$total');
        return;
      }
      res
        ..statusCode = HttpStatus.partialContent
        ..headers.set(
          HttpHeaders.contentRangeHeader,
          'bytes $start-$end/$total',
        );
    }
    res.contentLength = end - start + 1;
    if (req.method != 'HEAD') {
      res.add(Uint8List.sublistView(bytes, start, end + 1));
    }
  } on Object catch (e) {
    debugPrint('e2ee media serve: $e');
    // Once the body has started the status is fixed; closing ends it short.
    if (res.contentLength < 0) res.statusCode = HttpStatus.internalServerError;
  } finally {
    await res.close();
  }
}
