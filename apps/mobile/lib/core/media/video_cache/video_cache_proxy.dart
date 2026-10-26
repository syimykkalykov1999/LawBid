import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:lawbid/core/media/video_cache/chunk_cache.dart';
import 'package:lawbid/core/media/video_cache/range_plan.dart';

/// N-1: a tiny loopback HTTP server (127.0.0.1 only, per-launch secret in
/// the path) that sits between the native player (ExoPlayer / AVPlayer,
/// which cannot read a Dart disk cache) and the CDN, the same trick as
/// AndroidVideoCache / KTVHTTPCache:
///  * MP4: the first [headBytes] are served from 256 KB blocks on disk
///    (fetched once with `Range`), the rest is piped through untouched.
///  * HLS: the playlist is rewritten so the first [hlsSeconds] of segments
///    go through the cache and everything else is a plain pass-through.
/// Only https upstreams are ever contacted.
class VideoCacheProxy {
  VideoCacheProxy({
    required this.cache,
    required this.headBytes,
    required this.hlsSeconds,
    HttpClient? client,
  }) : _client = client ?? HttpClient()
          ..connectionTimeout = const Duration(seconds: 8);

  final ChunkCache cache;
  final int headBytes;
  final int hlsSeconds;
  final HttpClient _client;

  HttpServer? _server;
  final String _secret = _randomSecret();
  final _totals = <String, int>{};

  bool get running => _server != null;

  static String _randomSecret() {
    final r = Random.secure();
    return List.generate(
      12,
      (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> start() async {
    if (_server != null) return;
    final s = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server = s;
    unawaited(s.forEach(_handle));
  }

  Future<void> stop() async {
    final s = _server;
    _server = null;
    await s?.close(force: true);
  }

  /// The local URL that plays [upstream] (an https MP4 or `.m3u8`).
  String wrap(Uri upstream, {bool cache = true, bool isPlaylist = false}) {
    final kind = isPlaylist ? 'p' : (cache ? 'c' : 'x');
    final u = base64Url.encode(utf8.encode(upstream.toString()));
    return 'http://127.0.0.1:${_server!.port}/$_secret/$kind/$u';
  }

  /// Query parameters that only prove access (expire on every API answer);
  /// they never change the bytes, so they stay out of the cache identity.
  static bool _isSignatureParam(String name) {
    final n = name.toLowerCase();
    return n == 'expires' ||
        n == 'signature' ||
        n == 'key-pair-id' ||
        n == 'token' ||
        n == 'policy' ||
        n == 'hdnts' ||
        n.startsWith('x-amz-') ||
        n.startsWith('x-goog-');
  }

  /// The stable identity of an object: scheme + host + path + the query
  /// parameters that are not signatures (sorted). A signed chat video gets a
  /// new signature on every API answer, the identity stays the same.
  static String identityOf(Uri u) {
    final keep = u.queryParametersAll.entries
        .where((e) => !_isSignatureParam(e.key))
        .toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final q = keep.expand((e) => e.value.map((v) => '${e.key}=$v')).join('&');
    return '${u.scheme}://${u.host}${u.hasPort ? ':${u.port}' : ''}${u.path}'
        '${q.isEmpty ? '' : '?$q'}';
  }

  /// The key of a cached object (SHA-1 of the [identity], hex). Pass
  /// `identityOf(uri)`, never a signed URL.
  static String keyOf(String identity, [String suffix = '']) =>
      '${sha1.convert(utf8.encode(identity))}$suffix';

  Future<void> _handle(HttpRequest req) async {
    try {
      final seg = req.uri.pathSegments;
      if (seg.length != 3 || seg[0] != _secret) {
        req.response.statusCode = HttpStatus.forbidden;
        await req.response.close();
        return;
      }
      final upstream = Uri.parse(utf8.decode(base64Url.decode(seg[2])));
      if (upstream.scheme != 'https') {
        req.response.statusCode = HttpStatus.forbidden;
        await req.response.close();
        return;
      }
      switch (seg[1]) {
        case 'p':
          await _playlist(req, upstream);
        case 'c':
          await _cached(req, upstream);
        default:
          await _pipe(req, upstream);
      }
    } on Object {
      try {
        req.response.statusCode = HttpStatus.badGateway;
        await req.response.close();
      } on Object {
        // Connection already gone.
      }
    }
  }

  Future<HttpClientResponse> _open(Uri url, {String? range}) async {
    final r = await _client.getUrl(url);
    if (range != null) r.headers.set(HttpHeaders.rangeHeader, range);
    return r.close();
  }

  /// A playlist: fetched fresh, rewritten, never cached on disk.
  Future<void> _playlist(HttpRequest req, Uri upstream) async {
    final up = await _open(upstream);
    final text = await utf8.decodeStream(up);
    final out = text.contains('#EXT-X-STREAM-INF')
        ? rewritePlaylist(text, upstream, 0, wrap)
        : rewritePlaylist(
            text,
            upstream,
            cachedSegmentCount(text, hlsSeconds),
            wrap,
          );
    req.response
      ..statusCode = up.statusCode
      ..headers.contentType = ContentType('application', 'vnd.apple.mpegurl');
    req.response.write(out);
    await req.response.close();
  }

  Future<void> _pipe(HttpRequest req, Uri upstream) async {
    final up = await _open(
      upstream,
      range: req.headers.value(HttpHeaders.rangeHeader),
    );
    req.response.statusCode = up.statusCode;
    for (final h in const [
      HttpHeaders.contentTypeHeader,
      HttpHeaders.contentLengthHeader,
      HttpHeaders.contentRangeHeader,
      HttpHeaders.acceptRangesHeader,
    ]) {
      final v = up.headers.value(h);
      if (v != null) req.response.headers.set(h, v);
    }
    await req.response.addStream(up);
    await req.response.close();
  }

  /// A cached object. HLS segments are small: stored whole. An MP4 is
  /// served block by block for its head, piped for the tail.
  Future<void> _cached(HttpRequest req, Uri upstream) async {
    if (!upstream.path.endsWith('.mp4') && !upstream.path.endsWith('.mov')) {
      return _cachedSegment(req, upstream);
    }
    final rangeHeader = req.headers.value(HttpHeaders.rangeHeader);
    final total = await _total(upstream);
    if (total == null) return _pipe(req, upstream);
    final r = parseRange(rangeHeader, total) ?? (0, total - 1);
    final (start, end) = r;
    final blocks = headBlocks(
      start: start,
      endInclusive: end,
      headBytes: headBytes,
    );
    final res = req.response
      ..statusCode =
          rangeHeader == null ? HttpStatus.ok : HttpStatus.partialContent
      ..headers.set(HttpHeaders.acceptRangesHeader, 'bytes')
      ..headers.contentType = ContentType('video', 'mp4')
      ..contentLength = end - start + 1;
    if (rangeHeader != null) {
      res.headers.set(
        HttpHeaders.contentRangeHeader,
        'bytes $start-$end/$total',
      );
    }
    var pos = start;
    for (final b in blocks) {
      final data = await _block(upstream, b, total);
      if (data == null) break;
      final from = pos - b.start;
      final to = (end - b.start + 1).clamp(0, data.length);
      res.add(data.sublist(from, to));
      pos = b.start + to;
    }
    if (pos <= end) {
      final up = await _open(upstream, range: 'bytes=$pos-$end');
      await res.addStream(up);
    }
    await res.close();
  }

  /// The object's size. Looked up by identity (memory, then a tiny disk
  /// entry), so a re-signed URL of a video we already hold costs no probe;
  /// only a never-seen object sends `Range: bytes=0-0`.
  Future<int?> _total(Uri upstream) async {
    final id = identityOf(upstream);
    final known = _totals[id];
    if (known != null) return known;
    final tkey = keyOf(id, '_total');
    final onDisk = await cache.get(tkey);
    if (onDisk != null && onDisk.length == 8) {
      final t = ByteData.sublistView(onDisk).getUint64(0);
      _totals[id] = t;
      return t;
    }
    final up = await _open(upstream, range: 'bytes=0-0');
    final total = totalFromContentRange(
      up.headers.value(HttpHeaders.contentRangeHeader),
    );
    await up.drain<void>();
    if (total != null) {
      _totals[id] = total;
      final bd = ByteData(8)..setUint64(0, total);
      await cache.put(tkey, bd.buffer.asUint8List());
    }
    return total;
  }

  /// Fetches with the signed [upstream] URL, stores under its identity.
  Future<Uint8List?> _block(Uri upstream, BlockRange b, int total) async {
    final key = keyOf(identityOf(upstream), '_${b.index}');
    final hit = await cache.get(key);
    if (hit != null) return hit;
    final end = b.endInclusive >= total ? total - 1 : b.endInclusive;
    final up = await _open(upstream, range: 'bytes=${b.start}-$end');
    if (up.statusCode != HttpStatus.partialContent) {
      await up.drain<void>();
      return null;
    }
    final bb = BytesBuilder(copy: false);
    await for (final c in up) {
      bb.add(c);
    }
    final bytes = bb.takeBytes();
    await cache.put(key, bytes);
    return bytes;
  }

  Future<void> _cachedSegment(HttpRequest req, Uri upstream) async {
    final key = keyOf(identityOf(upstream), '_seg');
    var bytes = await cache.get(key);
    if (bytes == null) {
      final up = await _open(upstream);
      if (up.statusCode != HttpStatus.ok) {
        req.response.statusCode = up.statusCode;
        await req.response.close();
        return;
      }
      final bb = BytesBuilder(copy: false);
      await for (final c in up) {
        bb.add(c);
      }
      bytes = bb.takeBytes();
      await cache.put(key, bytes);
    }
    final range = parseRange(
      req.headers.value(HttpHeaders.rangeHeader),
      bytes.length,
    );
    final (s, e) = range ?? (0, bytes.length - 1);
    req.response
      ..statusCode = range == null ? HttpStatus.ok : HttpStatus.partialContent
      ..headers.contentType = ContentType.binary
      ..contentLength = e - s + 1;
    if (range != null) {
      req.response.headers.set(
        HttpHeaders.contentRangeHeader,
        'bytes $s-$e/${bytes.length}',
      );
    }
    req.response.add(bytes.sublist(s, e + 1));
    await req.response.close();
  }
}
