import 'dart:convert';

import 'package:dio/dio.dart';

/// Owner 2026-10-15 (the app flies, costs less): a GET whose answer has not
/// changed is not downloaded again.
///
/// The server tags every JSON answer with an `ETag`. This remembers the
/// last answer of each GET (per signed-in user, per language) together with
/// its tag and asks `If-None-Match` next time; when the server replies
/// `304 Not Modified` (an empty body), the remembered answer is handed back
/// as if it had just arrived. Nothing is ever shown stale: a 304 is the
/// server saying "still the same".
///
/// Memory only and bounded (least-recently-used entries go first), so there
/// is no disk to clean and nothing survives the process. The switch is on
/// the server (`HTTP_ETAG=false` stops sending tags, so nothing is stored)
/// and in the build (`--dart-define=ETAG_CACHE=false`).
class EtagCacheInterceptor extends Interceptor {
  EtagCacheInterceptor({
    this.maxEntries = 120,
    this.maxBytes = 16 * 1024 * 1024,
  });

  final int maxEntries;
  final int maxBytes;

  static const _keyExtra = 'etagCacheKey';
  static const _hitExtra = 'etagCacheHit';

  final _entries = <String, _Entry>{};
  int _bytes = 0;

  int get length => _entries.length;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.method.toUpperCase() == 'GET' &&
        options.responseType == ResponseType.json) {
      final key = _key(options);
      options.extra[_keyExtra] = key;
      final hit = _entries.remove(key);
      if (hit != null) {
        _entries[key] = hit; // most recently used goes last
        options.headers['If-None-Match'] = hit.etag;
        // Held on the request itself: an eviction between the request and
        // its 304 must not turn the answer into an error.
        options.extra[_hitExtra] = hit;
      }
    }
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final key = response.requestOptions.extra[_keyExtra] as String?;
    final etag = response.headers.value('etag');
    final data = response.data;
    if (key != null &&
        response.statusCode == 200 &&
        etag != null &&
        etag.isNotEmpty &&
        (data is Map || data is List) &&
        !(response.headers.value('cache-control') ?? '').contains('no-store')) {
      _put(key, _Entry(etag, data, _estimate(response)));
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final res = err.response;
    final hit = err.requestOptions.extra[_hitExtra];
    if (res != null && res.statusCode == 304 && hit is _Entry) {
      handler.resolve(
        Response<dynamic>(
          requestOptions: err.requestOptions,
          data: hit.data,
          statusCode: 200,
          headers: res.headers,
        ),
      );
      return;
    }
    handler.next(err);
  }

  void clear() {
    _entries.clear();
    _bytes = 0;
  }

  void _put(String key, _Entry entry) {
    final old = _entries.remove(key);
    if (old != null) _bytes -= old.bytes;
    _entries[key] = entry;
    _bytes += entry.bytes;
    while (_entries.length > maxEntries || _bytes > maxBytes) {
      final oldest = _entries.keys.first;
      _bytes -= _entries.remove(oldest)!.bytes;
    }
  }

  /// A decoded JSON tree takes several times the size of its text.
  int _estimate(Response<dynamic> response) {
    final length = int.tryParse(response.headers.value('content-length') ?? '');
    return (length ?? 4096) * 4;
  }

  /// One entry per user and language: another account (or a language
  /// switch) never sees someone else's, or an other-language, answer.
  String _key(RequestOptions options) {
    final auth =
        options.headers['Authorization'] ?? options.headers['authorization'];
    final lang = options.headers['Accept-Language'] ??
        options.headers['accept-language'];
    return '${_subject(auth)}|$lang|${options.uri}';
  }

  /// The `sub` of the bearer token (the token itself changes on every
  /// refresh; the user does not).
  static String _subject(Object? authorization) {
    if (authorization is! String || !authorization.startsWith('Bearer ')) {
      return 'anon';
    }
    final parts = authorization.substring(7).split('.');
    if (parts.length != 3) return 'anon';
    try {
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      final sub = payload is Map ? payload['sub'] : null;
      return sub is String && sub.isNotEmpty ? sub : 'anon';
    } on Object {
      return 'anon';
    }
  }
}

class _Entry {
  _Entry(this.etag, this.data, this.bytes);

  final String etag;
  final dynamic data;
  final int bytes;
}
